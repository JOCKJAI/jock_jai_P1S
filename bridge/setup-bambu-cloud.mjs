import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');

function question(prompt) {
  return new Promise((resolveAnswer) => {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    terminal.question(prompt, (answer) => {
      terminal.close();
      resolveAnswer(answer.trim());
    });
  });
}

function secretQuestion(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('請在可互動的 Terminal 執行此設定器。');
  }

  return new Promise((resolveAnswer, reject) => {
    let answer = '';
    const input = process.stdin;
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stdout.write(prompt);

    const finish = (error) => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolveAnswer(answer);
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        finish(new Error('已取消設定。'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        finish();
        return;
      }
      if (key.name === 'backspace') {
        if (answer.length > 0) {
          answer = answer.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (character && !key.ctrl && !key.meta) {
        answer += character;
        process.stdout.write('*');
      }
    };

    input.on('keypress', onKeypress);
  });
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Coinprint-P1S-Bridge/1.0',
      ...options.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload.message || payload.error || `HTTP ${response.status}`;
    throw new Error(`Bambu Cloud：${reason}`);
  }
  return payload;
}

async function passwordLogin(apiBase, account, password) {
  let session = await jsonRequest(`${apiBase}/v1/user-service/user/login`, {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });

  return session;
}

async function codeLogin(apiBase, account, code) {
  return jsonRequest(`${apiBase}/v1/user-service/user/login`, {
    method: 'POST',
    body: JSON.stringify({ account, code }),
  });
}

async function login(apiBase, account) {
  const password = await secretQuestion('Bambu 帳戶密碼（不會儲存）：');
  let session = await passwordLogin(apiBase, account, password);

  if (!session.accessToken && session.loginType === 'verifyCode') {
    const code = await question('輸入 Bambu 電郵驗證碼：');
    session = await codeLogin(apiBase, account, code);
  }

  if (!session.accessToken) {
    throw new Error('登入未有取得 access token；如帳戶開啟了額外驗證，請先在 Bambu Handy 完成驗證後再試。');
  }
  return session.accessToken;
}

function pickUid(preference) {
  const candidates = [
    preference.uid,
    preference.userId,
    preference.user_id,
    preference.user?.uid,
    preference.profile?.uid,
  ];
  return candidates.find((value) => value !== undefined && value !== null && String(value).trim())?.toString();
}

async function selectDevice(devices) {
  if (!Array.isArray(devices) || devices.length === 0) {
    throw new Error('Bambu 帳戶未有找到已綁定的打印機。');
  }
  if (devices.length === 1) return devices[0];

  console.log('\n已綁定打印機：');
  devices.forEach((device, index) => {
    const serial = String(device.dev_id || 'unknown');
    console.log(`${index + 1}. ${device.name || device.dev_product_name || 'Bambu printer'} · …${serial.slice(-5)}`);
  });
  const answer = await question(`選擇 P1S [1-${devices.length}]：`);
  const index = Number(answer) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= devices.length) {
    throw new Error('選擇無效，設定未有改動。');
  }
  return devices[index];
}

function writeCloudSettings(values) {
  const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const keys = new Set(Object.keys(values));
  const preserved = original
    .split(/\r?\n/)
    .filter((line) => {
      const separator = line.indexOf('=');
      return separator < 1 || !keys.has(line.slice(0, separator).trim());
    });
  while (preserved.at(-1) === '') preserved.pop();
  if (preserved.length > 0) preserved.push('');
  preserved.push('# Bambu Cloud bridge (generated locally; do not commit)');
  for (const [key, value] of Object.entries(values)) preserved.push(`${key}=${value}`);
  writeFileSync(envPath, `${preserved.join('\n')}\n`, { mode: 0o600 });
  chmodSync(envPath, 0o600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

function renderPage({ action, fields, message = '', error = '' }) {
  const inputs = fields.map((field) => `
    <label>${escapeHtml(field.label)}
      <input name="${escapeHtml(field.name)}" type="${field.type || 'text'}" value="${escapeHtml(field.value || '')}" ${field.required === false ? '' : 'required'} autocomplete="${field.autocomplete || 'off'}" autofocus>
    </label>`).join('');
  return `<!doctype html>
<html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>COINPRINT · Bambu Cloud</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07131e;color:#eaf4ff;font:16px system-ui,sans-serif;padding:24px}.card{width:min(440px,100%);border:1px solid #27506b;background:#0b1c29;padding:28px;box-shadow:10px 10px 0 #04101a}p{color:#9eb3c3;line-height:1.55}label{display:grid;gap:8px;margin:18px 0;color:#cfe5f4}input,select,button{width:100%;min-height:46px;border:1px solid #35627d;background:#06131d;color:#fff;padding:10px 12px;font:inherit}button,a{margin-top:8px;background:#abf23e;color:#071006;border:1px solid #d3ff83;font-weight:800;cursor:pointer}a{display:block;padding:12px;text-align:center;text-decoration:none}.error{color:#ff876d}.ok{color:#abf23e}.note{font-size:13px}</style></head>
<body><main class="card"><h1>Bambu Cloud 連接</h1><p>只限呢部電腦使用。密碼會直接經 HTTPS 傳去 Bambu，不會儲存。</p>${message ? `<p class="ok">${escapeHtml(message)}</p>` : ''}${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}${fields.length ? `<form method="post" action="${escapeHtml(action)}">${inputs}<button type="submit">繼續</button></form>` : error ? `<a href="${escapeHtml(action)}">重新開始</a>` : ''}<p class="note">完成後可以關閉此頁。</p></main></body></html>`;
}

function readForm(request) {
  return new Promise((resolveForm, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) request.destroy();
    });
    request.on('end', () => resolveForm(new URLSearchParams(body)));
    request.on('error', reject);
  });
}

async function resolveCloudSettings(apiBase, region, accessToken) {
  const authHeaders = { Authorization: `Bearer ${accessToken}` };
  const [preference, binding] = await Promise.all([
    jsonRequest(`${apiBase}/v1/design-user-service/my/preference`, { headers: authHeaders }),
    jsonRequest(`${apiBase}/v1/iot-service/api/user/bind`, { headers: authHeaders }),
  ]);
  const userId = pickUid(preference);
  if (!userId) throw new Error('登入成功，但未能讀取 Bambu UID。');
  const devices = Array.isArray(binding.devices) ? binding.devices : [];
  if (devices.length === 0) throw new Error('Bambu 帳戶未有找到已綁定的打印機。');

  const existingSerial = process.env.BAMBU_SERIAL?.trim();
  const device = devices.find((item) => item.dev_id === existingSerial)
    || devices.find((item) => /P1S/i.test(`${item.name || ''} ${item.dev_product_name || ''}`))
    || devices[0];
  const serial = String(device.dev_id || '').trim();
  if (!serial) throw new Error('所選打印機沒有 device ID。');
  writeCloudSettings({
    BAMBU_CONNECTION_MODE: 'cloud',
    BAMBU_CLOUD_REGION: region,
    BAMBU_CLOUD_USER_ID: userId,
    BAMBU_CLOUD_ACCESS_TOKEN: accessToken,
    BAMBU_SERIAL: serial,
  });
  return device.name || device.dev_product_name || 'P1S';
}

async function webMain() {
  loadExistingEnv();
  const guard = randomBytes(24).toString('hex');
  const port = Number(process.env.BAMBU_SETUP_PORT || 8790);
  let pendingAccount = '';
  let pendingRegion = 'global';

  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    if (url.searchParams.get('key') !== guard) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const action = `${url.pathname}?key=${guard}`;
    if (request.method === 'GET') {
      response.end(renderPage({
        action: `/login?key=${guard}`,
        fields: [
          { label: '地區（global = 全球／香港；china = 中國大陸）', name: 'region', value: 'global', autocomplete: 'off' },
          { label: 'Bambu 帳戶電郵', name: 'account', type: 'email', autocomplete: 'username' },
          { label: 'Bambu 帳戶密碼', name: 'password', type: 'password', autocomplete: 'current-password' },
        ],
      }));
      return;
    }

    try {
      const form = await readForm(request);
      if (url.pathname === '/login') {
        pendingRegion = form.get('region')?.trim().toLowerCase() === 'china' ? 'china' : 'global';
        pendingAccount = form.get('account')?.trim() || '';
        const password = form.get('password') || '';
        if (!pendingAccount || !password) throw new Error('請填寫電郵及密碼。');
        const apiBase = pendingRegion === 'china' ? 'https://api.bambulab.cn' : 'https://api.bambulab.com';
        const session = await passwordLogin(apiBase, pendingAccount, password);
        if (!session.accessToken && session.loginType === 'verifyCode') {
          response.end(renderPage({
            action: `/verify?key=${guard}`,
            message: '驗證碼已發送，請檢查電郵。',
            fields: [{ label: 'Bambu 電郵驗證碼', name: 'code', autocomplete: 'one-time-code' }],
          }));
          return;
        }
        if (!session.accessToken) throw new Error('登入未有取得 access token。');
        const deviceName = await resolveCloudSettings(apiBase, pendingRegion, session.accessToken);
        response.end(renderPage({ action, message: `${deviceName} 已成功連接 Bambu Cloud。`, fields: [] }));
        setTimeout(() => server.close(), 1500).unref();
        return;
      }

      if (url.pathname === '/verify') {
        const code = form.get('code')?.trim() || '';
        if (!pendingAccount || !code) throw new Error('驗證資料已失效，請重新開始。');
        const apiBase = pendingRegion === 'china' ? 'https://api.bambulab.cn' : 'https://api.bambulab.com';
        const session = await codeLogin(apiBase, pendingAccount, code);
        if (!session.accessToken) throw new Error('驗證失敗，請重新開始。');
        const deviceName = await resolveCloudSettings(apiBase, pendingRegion, session.accessToken);
        response.end(renderPage({ action, message: `${deviceName} 已成功連接 Bambu Cloud。`, fields: [] }));
        setTimeout(() => server.close(), 1500).unref();
        return;
      }

      response.writeHead(404).end('Not found');
    } catch (error) {
      response.writeHead(400).end(renderPage({
        action: `/?key=${guard}`,
        error: error instanceof Error ? error.message : String(error),
        fields: [],
      }));
    }
  });

  await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
  console.log(`BAMBU_SETUP_URL=http://127.0.0.1:${port}/?key=${guard}`);
}

function loadExistingEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  console.log('COINPRINT · Bambu Cloud 設定');
  console.log('登入資料只會直接傳去 Bambu Cloud；只會把約 3 個月有效的 token 留在本機 .env.local。\n');

  const regionAnswer = (await question('地區：1 全球／香港，2 中國大陸 [1]：')) || '1';
  const region = regionAnswer === '2' ? 'china' : 'global';
  const apiBase = region === 'china' ? 'https://api.bambulab.cn' : 'https://api.bambulab.com';
  const account = await question('Bambu 帳戶電郵：');
  if (!account) throw new Error('電郵不可留空。');

  const accessToken = await login(apiBase, account);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };
  const [preference, binding] = await Promise.all([
    jsonRequest(`${apiBase}/v1/design-user-service/my/preference`, { headers: authHeaders }),
    jsonRequest(`${apiBase}/v1/iot-service/api/user/bind`, { headers: authHeaders }),
  ]);
  const userId = pickUid(preference);
  if (!userId) throw new Error('登入成功，但未能讀取 Bambu UID。');
  const device = await selectDevice(binding.devices);
  const serial = String(device.dev_id || '').trim();
  if (!serial) throw new Error('所選打印機沒有 device ID。');

  writeCloudSettings({
    BAMBU_CONNECTION_MODE: 'cloud',
    BAMBU_CLOUD_REGION: region,
    BAMBU_CLOUD_USER_ID: userId,
    BAMBU_CLOUD_ACCESS_TOKEN: accessToken,
    BAMBU_SERIAL: serial,
  });

  console.log(`\n完成：${device.name || device.dev_product_name || 'P1S'} 已設為 Bambu Cloud 狀態來源。`);
  console.log('下一步執行：npm run bridge');
}

const entrypoint = process.argv.includes('--web') ? webMain : main;
entrypoint().catch((error) => {
  console.error(`\n設定失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

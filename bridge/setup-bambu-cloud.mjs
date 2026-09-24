import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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

async function login(apiBase, account) {
  const password = await secretQuestion('Bambu 帳戶密碼（不會儲存）：');
  let session = await jsonRequest(`${apiBase}/v1/user-service/user/login`, {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });

  if (!session.accessToken && session.loginType === 'verifyCode') {
    const code = await question('輸入 Bambu 電郵驗證碼：');
    session = await jsonRequest(`${apiBase}/v1/user-service/user/login`, {
      method: 'POST',
      body: JSON.stringify({ account, code }),
    });
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

main().catch((error) => {
  console.error(`\n設定失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

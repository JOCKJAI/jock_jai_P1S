import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [tokenPath, envPath, endpoint] = process.argv.slice(2);
if (!tokenPath || !envPath || !endpoint) {
  throw new Error('Usage: node bridge/configure-cloud-sync.mjs <token-file> <env-file> <endpoint>');
}

const token = readFileSync(tokenPath, 'utf8').trim();
if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('Invalid bridge token');

const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const values = new Map();
for (const line of original.split(/\r?\n/)) {
  const separator = line.indexOf('=');
  if (separator > 0 && !line.trimStart().startsWith('#')) {
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1));
  }
}
values.set('COINPRINT_STATUS_URL', endpoint);
values.set('COINPRINT_BRIDGE_TOKEN', token);

const preserved = original
  .split(/\r?\n/)
  .filter((line) => !/^COINPRINT_(STATUS_URL|BRIDGE_TOKEN)=/.test(line));
while (preserved.at(-1) === '') preserved.pop();
preserved.push(`COINPRINT_STATUS_URL=${values.get('COINPRINT_STATUS_URL')}`);
preserved.push(`COINPRINT_BRIDGE_TOKEN=${values.get('COINPRINT_BRIDGE_TOKEN')}`);
writeFileSync(envPath, `${preserved.join('\n')}\n`, { mode: 0o600 });

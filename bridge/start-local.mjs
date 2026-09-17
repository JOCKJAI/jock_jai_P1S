import { spawn } from 'node:child_process';

const bridge = spawn(process.execPath, ['bridge/bambu-local.mjs'], { stdio: 'inherit' });
const site = spawn('npm', ['run', 'dev'], { stdio: 'inherit' });

function stop(signal = 'SIGTERM') {
  if (!bridge.killed) bridge.kill(signal);
  if (!site.killed) site.kill(signal);
}

bridge.on('exit', (code) => {
  if (code && code !== 0) console.error(`Bridge stopped with code ${code}`);
});

site.on('exit', (code) => {
  stop();
  process.exit(code ?? 0);
});

process.on('SIGINT', () => { stop('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { stop('SIGTERM'); process.exit(0); });

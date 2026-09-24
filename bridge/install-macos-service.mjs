import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  throw new Error('This installer is for macOS only.');
}

const label = 'com.coinprint.bambu-bridge';
const userId = process.getuid();
const projectDir = resolve(process.cwd());
const bridgePath = join(projectDir, 'bridge', 'bambu-local.mjs');
const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
const logDir = join(homedir(), 'Library', 'Logs', 'Coinprint');
const plistPath = join(launchAgentsDir, `${label}.plist`);
const serviceTarget = `gui/${userId}/${label}`;

function xml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function launchctl(args, { allowFailure = false } = {}) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8' });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr.trim() || `launchctl ${args[0]} failed`);
  }
}

mkdirSync(launchAgentsDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(bridgePath)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(projectDir)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(join(logDir, 'bridge.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logDir, 'bridge-error.log'))}</string>
</dict>
</plist>
`;

writeFileSync(plistPath, plist, { mode: 0o644 });
launchctl(['bootout', `gui/${userId}`, plistPath], { allowFailure: true });
launchctl(['bootstrap', `gui/${userId}`, plistPath]);
launchctl(['enable', serviceTarget]);
launchctl(['kickstart', '-k', serviceTarget]);

console.log('COINPRINT P1S bridge is installed and running at login.');

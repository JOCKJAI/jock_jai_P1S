import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import mqtt from 'mqtt';

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const separator = clean.indexOf('=');
    if (separator < 1) continue;
    const key = clean.slice(0, separator).trim();
    const value = clean.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const bridgePort = Number(process.env.BRIDGE_PORT || 8789);
const printerHost = process.env.BAMBU_HOST?.trim();
const printerSerial = process.env.BAMBU_SERIAL?.trim();
const accessCode = process.env.BAMBU_ACCESS_CODE?.trim();
const configured = Boolean(printerHost && printerSerial && accessCode);

let status = {
  bridge: configured ? 'connecting' : 'setup_required',
  connected: false,
  model: 'Bambu Lab P1S',
  state: 'UNKNOWN',
  filename: 'Waiting for printer',
  progress: 0,
  remainingMinutes: 0,
  layer: 0,
  totalLayers: 0,
  nozzleTemp: 0,
  bedTemp: 0,
  hasError: false,
  updatedAt: null,
};

const printSnapshot = {};

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeState(value) {
  const raw = String(value || 'UNKNOWN').toUpperCase();
  if (['RUNNING', 'PRINTING', 'PREPARE'].includes(raw)) return 'PRINTING';
  if (['PAUSE', 'PAUSED'].includes(raw)) return 'PAUSED';
  if (['FINISH', 'FINISHED', 'IDLE'].includes(raw)) return 'IDLE';
  if (['FAILED', 'ERROR'].includes(raw)) return 'ERROR';
  return raw;
}

function updateStatus(payload) {
  const next = payload?.print || payload?.pushing || payload;
  if (!next || typeof next !== 'object') return;
  Object.assign(printSnapshot, next);

  const hms = printSnapshot.hms;
  status = {
    bridge: 'live',
    connected: true,
    model: 'Bambu Lab P1S',
    state: normalizeState(printSnapshot.gcode_state || printSnapshot.print_type),
    filename: printSnapshot.subtask_name || printSnapshot.gcode_file || printSnapshot.project_name || 'P1S',
    progress: Math.max(0, Math.min(100, numberOr(printSnapshot.mc_percent))),
    remainingMinutes: Math.max(0, numberOr(printSnapshot.mc_remaining_time)),
    layer: Math.max(0, numberOr(printSnapshot.layer_num)),
    totalLayers: Math.max(0, numberOr(printSnapshot.total_layer_num)),
    nozzleTemp: numberOr(printSnapshot.nozzle_temper),
    bedTemp: numberOr(printSnapshot.bed_temper),
    hasError: Array.isArray(hms) ? hms.length > 0 : Boolean(printSnapshot.print_error),
    updatedAt: new Date().toISOString(),
  };
}

if (configured) {
  const reportTopic = `device/${printerSerial}/report`;
  const requestTopic = `device/${printerSerial}/request`;
  const client = mqtt.connect(`mqtts://${printerHost}:8883`, {
    username: 'bblp',
    password: accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 60,
    clean: true,
    clientId: `coinprint_${Math.random().toString(16).slice(2, 10)}`,
  });

  const requestFullStatus = () => {
    client.publish(requestTopic, JSON.stringify({
      pushing: { sequence_id: String(Date.now()), command: 'pushall' },
    }));
  };

  client.on('connect', () => {
    status = { ...status, bridge: 'connected', connected: true };
    client.subscribe(reportTopic, { qos: 0 }, (error) => {
      if (!error) requestFullStatus();
    });
  });

  client.on('message', (_topic, message) => {
    try {
      updateStatus(JSON.parse(message.toString('utf8')));
    } catch {
      // Ignore malformed printer packets and retain the last known good state.
    }
  });

  client.on('offline', () => {
    status = { ...status, bridge: 'offline', connected: false };
  });

  client.on('error', (error) => {
    status = { ...status, bridge: 'error', connected: false, error: error.message };
  });

  setInterval(requestFullStatus, 30000).unref();
}

const server = http.createServer((request, response) => {
  const origin = request.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  if (request.method === 'GET' && ['/status', '/health'].includes(request.url)) {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(status));
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(bridgePort, '127.0.0.1', () => {
  const mode = configured ? 'connecting to P1S' : 'waiting for .env.local setup';
  console.log(`COINPRINT bridge: http://127.0.0.1:${bridgePort}/status (${mode})`);
});

import { env } from 'cloudflare:workers';

import { printerStatusSchema, queueCreatedAtIndex, queueEntriesSchema } from '@/db/schema';

export type QueueItem = { id: string; name: string; color: string };
export type PrinterStatus = {
  bridge: 'demo' | 'setup_required' | 'connecting' | 'connected' | 'live' | 'offline' | 'error';
  connected: boolean;
  model: string;
  state: string;
  filename: string;
  progress: number;
  remainingMinutes: number;
  layer: number;
  totalLayers: number;
  nozzleTemp: number;
  bedTemp: number;
  hasError: boolean;
  updatedAt: string | null;
};

type Bindings = Cloudflare.Env & {
  DB: D1Database;
  BRIDGE_INGEST_TOKEN?: string;
};

export function getBindings() {
  return env as Bindings;
}

export async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(queueEntriesSchema),
    db.prepare(printerStatusSchema),
    db.prepare(queueCreatedAtIndex),
  ]);
}

export async function listQueue(db: D1Database): Promise<QueueItem[]> {
  const result = await db
    .prepare('SELECT id, name, color FROM queue_entries ORDER BY created_at ASC, id ASC LIMIT 100')
    .all<QueueItem>();
  return result.results;
}

export async function addQueueItem(db: D1Database, name: string): Promise<QueueItem[]> {
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO queue_entries (id, name, color) VALUES (?, ?, ?)')
    .bind(id, name, '#abf23e')
    .run();
  return listQueue(db);
}

export async function readPrinterStatus(db: D1Database): Promise<PrinterStatus | null> {
  const row = await db
    .prepare('SELECT payload, updated_at FROM printer_status WHERE id = 1')
    .first<{ payload: string; updated_at: string }>();

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.payload) as PrinterStatus;
    const lastUpdate = Date.parse(parsed.updatedAt || `${row.updated_at}Z`);
    const isStale = !Number.isFinite(lastUpdate) || Date.now() - lastUpdate > 30_000;
    return isStale ? { ...parsed, bridge: 'offline', connected: false } : parsed;
  } catch {
    return null;
  }
}

export async function writePrinterStatus(db: D1Database, status: PrinterStatus) {
  await db
    .prepare(`
      INSERT INTO printer_status (id, payload, updated_at)
      VALUES (1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
    `)
    .bind(JSON.stringify(status))
    .run();
}

import { env } from 'cloudflare:workers';

import { printerHandoffSchema, printerStatusSchema, queueCreatedAtIndex, queueEntriesSchema } from '@/db/schema';

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

export type PrinterHandoff = {
  readyForNext: boolean;
  pickedUpName: string | null;
  pickedUpAt: string | null;
};

export type Bindings = Cloudflare.Env & {
  DB: D1Database;
  BRIDGE_INGEST_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function getBindings() {
  return env as Bindings;
}

export async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(queueEntriesSchema),
    db.prepare(printerStatusSchema),
    db.prepare(printerHandoffSchema),
    db.prepare(queueCreatedAtIndex),
  ]);
}

export async function claimPrinterHandoff(db: D1Database, pickedUpName: string) {
  await db
    .prepare('INSERT OR IGNORE INTO printer_handoff (id, ready_for_next) VALUES (1, 0)')
    .run();
  const result = await db
    .prepare(`
      UPDATE printer_handoff
      SET ready_for_next = 1, picked_up_name = ?, picked_up_at = CURRENT_TIMESTAMP
      WHERE id = 1 AND ready_for_next = 0
    `)
    .bind(pickedUpName)
    .run();
  return Number(result.meta.changes || 0) === 1;
}

export async function clearPrinterHandoff(db: D1Database) {
  await db
    .prepare(`
      INSERT INTO printer_handoff (id, ready_for_next, picked_up_name, picked_up_at)
      VALUES (1, 0, NULL, NULL)
      ON CONFLICT(id) DO UPDATE SET
        ready_for_next = 0,
        picked_up_name = NULL,
        picked_up_at = NULL
    `)
    .run();
}

export async function readPrinterHandoff(db: D1Database): Promise<PrinterHandoff> {
  const row = await db
    .prepare('SELECT ready_for_next, picked_up_name, picked_up_at FROM printer_handoff WHERE id = 1')
    .first<{ ready_for_next: number; picked_up_name: string | null; picked_up_at: string | null }>();
  return {
    readyForNext: row?.ready_for_next === 1,
    pickedUpName: row?.picked_up_name || null,
    pickedUpAt: row?.picked_up_at || null,
  };
}

export async function completeQueueHead(db: D1Database) {
  const head = await getQueueHead(db);
  if (!head) return null;
  await db.prepare('DELETE FROM queue_entries WHERE id = ?').bind(head.id).run();
  return { pickedUp: head, queue: await listQueue(db) };
}

export async function listQueue(db: D1Database): Promise<QueueItem[]> {
  const result = await db
    .prepare('SELECT id, name, color FROM queue_entries ORDER BY created_at ASC, id ASC LIMIT 100')
    .all<QueueItem>();
  return result.results;
}

export async function getQueueHead(db: D1Database) {
  return db
    .prepare('SELECT id, name, color FROM queue_entries ORDER BY created_at ASC, id ASC LIMIT 1')
    .first<QueueItem>();
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

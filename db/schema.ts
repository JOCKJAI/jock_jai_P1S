export const queueEntriesSchema = `
CREATE TABLE IF NOT EXISTS queue_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#abf23e',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

export const printerStatusSchema = `
CREATE TABLE IF NOT EXISTS printer_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

export const printerHandoffSchema = `
CREATE TABLE IF NOT EXISTS printer_handoff (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ready_for_next INTEGER NOT NULL DEFAULT 0 CHECK (ready_for_next IN (0, 1)),
  picked_up_name TEXT,
  picked_up_at TEXT
)
`;

export const queueCreatedAtIndex = `
CREATE INDEX IF NOT EXISTS idx_queue_entries_created_at
ON queue_entries(created_at, id)
`;

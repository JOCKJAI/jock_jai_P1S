CREATE TABLE IF NOT EXISTS printer_handoff (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ready_for_next INTEGER NOT NULL DEFAULT 0 CHECK (ready_for_next IN (0, 1)),
  picked_up_name TEXT,
  picked_up_at TEXT
);

PRAGMA optimize;

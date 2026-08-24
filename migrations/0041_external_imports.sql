CREATE TABLE IF NOT EXISTS external_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  dataset TEXT NOT NULL,
  version TEXT NOT NULL,
  entries INTEGER NOT NULL DEFAULT 0,
  mapped INTEGER NOT NULL DEFAULT 0,
  written INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'rejected', 'failed')),
  detail TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_external_imports_recent
  ON external_imports (source, dataset, status, started_at DESC);

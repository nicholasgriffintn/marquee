CREATE TABLE IF NOT EXISTS viewer_signals (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title_id TEXT,
  journey_id TEXT,
  context TEXT NOT NULL DEFAULT '{}',
  weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS viewer_signals_lookup_idx
  ON viewer_signals (viewer_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS viewer_signals_journey_idx
  ON viewer_signals (journey_id);

CREATE INDEX IF NOT EXISTS viewer_signals_expiry_idx
  ON viewer_signals (expires_at);

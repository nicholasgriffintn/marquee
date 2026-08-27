CREATE TABLE "viewer_signals" (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_id TEXT,
  journey_id TEXT,
  context TEXT NOT NULL DEFAULT '{}',
  weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);

CREATE INDEX viewer_signals_expiry_idx
  ON viewer_signals (expires_at);

CREATE INDEX viewer_signals_journey_idx
  ON viewer_signals (journey_id);

CREATE INDEX viewer_signals_lookup_idx
  ON viewer_signals (viewer_id, type, created_at DESC);

CREATE TABLE "viewer_usher" (
  viewer_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in-progress', 'done', 'dismissed')),
  asked TEXT NOT NULL DEFAULT '[]',
  muted TEXT NOT NULL DEFAULT '{}',
  ignored INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT,
  last_prompted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, last_seen_at TEXT);

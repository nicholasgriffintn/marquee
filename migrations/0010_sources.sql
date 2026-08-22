CREATE TABLE IF NOT EXISTS linked_accounts (
  viewer_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  account_label TEXT,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT,
  PRIMARY KEY (viewer_id, provider)
);

CREATE TABLE IF NOT EXISTS link_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  return_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS link_states_expiry_idx ON link_states (expires_at);

CREATE TABLE IF NOT EXISTS title_schedule (
  id TEXT PRIMARY KEY,
  title_id TEXT,
  imdb_id TEXT,
  show_name TEXT NOT NULL,
  season INTEGER,
  episode INTEGER,
  episode_name TEXT,
  airs_at TEXT NOT NULL,
  network TEXT,
  source TEXT NOT NULL DEFAULT 'tvmaze',
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS title_schedule_airs_idx ON title_schedule (airs_at);
CREATE INDEX IF NOT EXISTS title_schedule_title_idx ON title_schedule (title_id);

CREATE TABLE IF NOT EXISTS title_buzz (
  title_id TEXT PRIMARY KEY,
  article TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  previous_views INTEGER NOT NULL DEFAULT 0,
  delta REAL NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS title_buzz_delta_idx ON title_buzz (delta DESC);

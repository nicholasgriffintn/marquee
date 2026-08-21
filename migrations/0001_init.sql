CREATE TABLE IF NOT EXISTS viewer_preferences (
  viewer_id TEXT PRIMARY KEY,
  selected_provider_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS viewing_entries (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'watched', 'dropped')),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  thoughts TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (viewer_id, title_id)
);

CREATE INDEX IF NOT EXISTS viewing_entries_viewer_updated_idx
  ON viewing_entries (viewer_id, updated_at DESC);

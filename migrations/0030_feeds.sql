CREATE TABLE IF NOT EXISTS viewer_feeds (
  token_hash TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS viewer_feeds_viewer_idx ON viewer_feeds (viewer_id);

CREATE TABLE IF NOT EXISTS viewer_guests (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  vetoes TEXT NOT NULL DEFAULT '[]',
  leanings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS viewer_guests_viewer_idx
  ON viewer_guests (viewer_id, created_at);

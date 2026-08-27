CREATE TABLE viewer_preferences (
  viewer_id TEXT PRIMARY KEY,
  selected_provider_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "viewer_guests" (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vetoes TEXT NOT NULL DEFAULT '[]',
  leanings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX viewer_guests_viewer_idx
  ON viewer_guests (viewer_id, created_at);

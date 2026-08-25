CREATE TABLE IF NOT EXISTS viewer_preferences (
  viewer_id TEXT PRIMARY KEY,
  selected_provider_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

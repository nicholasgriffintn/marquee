CREATE TABLE ai_rails (
  viewer_id TEXT PRIMARY KEY,
  signature TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "rail_feedback" (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rail_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('good', 'bad')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, rail_id)
);

CREATE TABLE IF NOT EXISTS viewer_answers (
  viewer_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, question_id)
);

CREATE TABLE IF NOT EXISTS viewer_usher (
  viewer_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in-progress', 'done', 'dismissed')),
  asked TEXT NOT NULL DEFAULT '[]',
  muted TEXT NOT NULL DEFAULT '{}',
  ignored INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT,
  last_prompted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pinned_shelves (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  title_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS pinned_shelves_viewer_idx
  ON pinned_shelves (viewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rail_feedback (
  viewer_id TEXT NOT NULL,
  rail_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('good', 'bad')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, rail_id)
);

CREATE TABLE IF NOT EXISTS catalog_people (
  name TEXT PRIMARY KEY,
  titles INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS catalog_people_titles_idx ON catalog_people (titles DESC);

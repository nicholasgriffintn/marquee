CREATE TABLE IF NOT EXISTS catalog_titles (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  year INTEGER,
  popularity REAL NOT NULL DEFAULT 0,
  provider_ids TEXT NOT NULL DEFAULT '[]',
  payload TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  enriched_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (media_type, tmdb_id)
);

CREATE INDEX IF NOT EXISTS catalog_titles_title_idx
  ON catalog_titles (title COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS catalog_titles_popularity_idx
  ON catalog_titles (popularity DESC);

CREATE TABLE IF NOT EXISTS catalog_sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  title_ids TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_snapshots (
  region TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  subject_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS ingestion_runs_started_idx
  ON ingestion_runs (started_at DESC);

CREATE TABLE title_language_buzz (
  title_id TEXT NOT NULL,
  language TEXT NOT NULL,
  article TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  previous_views INTEGER NOT NULL DEFAULT 0,
  share REAL NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, language)
);

CREATE INDEX title_language_buzz_share_idx ON title_language_buzz (title_id, share DESC);

CREATE TABLE wikipedia_project_volume (
  language TEXT PRIMARY KEY,
  views INTEGER NOT NULL,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE title_buzz ADD COLUMN world_views INTEGER NOT NULL DEFAULT 0;

ALTER TABLE title_buzz ADD COLUMN world_previous_views INTEGER NOT NULL DEFAULT 0;

ALTER TABLE title_buzz ADD COLUMN world_score REAL NOT NULL DEFAULT 0;

CREATE INDEX title_buzz_world_score_idx ON title_buzz (world_score DESC);

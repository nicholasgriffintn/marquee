CREATE TABLE source_works (
  entity_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  work_type TEXT,
  published_year INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_work_authors (
  work_entity_id TEXT NOT NULL REFERENCES source_works(entity_id) ON DELETE CASCADE,
  author_entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (work_entity_id, author_entity_id)
);

CREATE TABLE title_source_works (
  title_id TEXT NOT NULL,
  work_entity_id TEXT NOT NULL REFERENCES source_works(entity_id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, work_entity_id)
);

CREATE INDEX title_source_works_work_idx ON title_source_works (work_entity_id);

CREATE TABLE title_adaptation_scans (
  title_id TEXT PRIMARY KEY,
  works INTEGER NOT NULL DEFAULT 0,
  scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX title_adaptation_scans_scanned_idx ON title_adaptation_scans (scanned_at);

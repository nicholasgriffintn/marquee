CREATE TABLE source_works (
  work_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  work_type TEXT,
  published_year INTEGER,
  wikidata_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX source_works_wikidata_idx ON source_works (wikidata_id) WHERE wikidata_id IS NOT NULL;

CREATE TABLE source_work_authors (
  work_id TEXT NOT NULL REFERENCES source_works(work_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  wikidata_id TEXT,
  PRIMARY KEY (work_id, name)
);

CREATE TABLE title_source_works (
  title_id TEXT NOT NULL,
  work_id TEXT NOT NULL REFERENCES source_works(work_id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'wikidata',
  PRIMARY KEY (title_id, work_id, source)
);

CREATE INDEX title_source_works_work_idx ON title_source_works (work_id);

CREATE TABLE title_adaptation_scans (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  works INTEGER NOT NULL DEFAULT 0,
  scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_adaptation_scans_due_idx ON title_adaptation_scans (source, scanned_at);

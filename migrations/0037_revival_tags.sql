CREATE TABLE IF NOT EXISTS revival_tags (
  work_id TEXT NOT NULL REFERENCES revival_works(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('subject', 'genre', 'person', 'language', 'holder')),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (work_id, kind, slug)
);

CREATE INDEX IF NOT EXISTS revival_tags_lookup_idx ON revival_tags (kind, slug);
CREATE INDEX IF NOT EXISTS revival_tags_work_idx ON revival_tags (work_id);

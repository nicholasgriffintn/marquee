CREATE TABLE title_visual_format (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('colour', 'aspect_ratio')),
  value TEXT NOT NULL CHECK (length(trim(value)) > 0),
  source TEXT NOT NULL DEFAULT 'wikidata' CHECK (length(trim(source)) > 0),
  PRIMARY KEY (title_id, kind, value, source),
  CHECK (
    (kind = 'colour' AND value IN ('colour', 'black and white', 'sepia'))
    OR (kind = 'aspect_ratio' AND value GLOB '[0-9].[0-9][0-9]:1')
  )
);

CREATE INDEX title_visual_format_lookup_idx ON title_visual_format (kind, value, title_id);

CREATE TABLE title_visual_format_sync (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  values_found INTEGER NOT NULL DEFAULT 0 CHECK (values_found >= 0),
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_visual_format_sync_due_idx ON title_visual_format_sync (source, checked_at);

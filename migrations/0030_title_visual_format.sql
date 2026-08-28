CREATE TABLE title_visual_format (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('colour', 'aspect_ratio')),
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'wikidata',
  PRIMARY KEY (title_id, kind, value, source)
);

CREATE INDEX title_visual_format_lookup_idx ON title_visual_format (kind, value, title_id);

CREATE TABLE title_visual_format_sync (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  values_found INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_visual_format_sync_due_idx ON title_visual_format_sync (source, checked_at);

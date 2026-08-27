CREATE TABLE catalog_sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  title_ids TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, audience TEXT NOT NULL DEFAULT '{}');

CREATE TABLE catalog_section_facet_cache (
  kind TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  payload TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE TABLE "pinned_shelves" (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  title_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX pinned_shelves_viewer_idx
  ON pinned_shelves (viewer_id, created_at DESC);

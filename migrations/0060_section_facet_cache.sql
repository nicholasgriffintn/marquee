CREATE TABLE IF NOT EXISTS catalog_section_facet_cache (
  kind TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  payload TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

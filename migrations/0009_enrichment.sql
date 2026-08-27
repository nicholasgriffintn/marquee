CREATE TABLE title_enrichment (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, miss INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, next_check_at TEXT,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_enrichment_miss_idx
  ON title_enrichment (source, miss, fetched_at);

CREATE INDEX title_enrichment_next_check_idx
  ON title_enrichment (source, next_check_at);

CREATE INDEX title_enrichment_source_idx
  ON title_enrichment (source, fetched_at);

CREATE INDEX title_enrichment_source_title_idx
  ON title_enrichment (source, title_id);

CREATE TABLE title_embeddings (
  title_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  embedded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, content_hash TEXT);

CREATE TABLE title_insights (
  title_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

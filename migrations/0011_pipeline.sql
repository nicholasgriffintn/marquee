ALTER TABLE title_embeddings ADD COLUMN content_hash TEXT;

ALTER TABLE source_budgets ADD COLUMN paused_until TEXT;

CREATE INDEX IF NOT EXISTS catalog_titles_updated_idx
  ON catalog_titles (updated_at);

CREATE INDEX IF NOT EXISTS title_buzz_measured_idx
  ON title_buzz (measured_at);

CREATE INDEX IF NOT EXISTS ingestion_runs_status_idx
  ON ingestion_runs (status, started_at);

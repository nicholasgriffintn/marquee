CREATE TABLE IF NOT EXISTS source_budgets (
  source TEXT PRIMARY KEY,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('day', 'month')),
  call_limit INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS title_enrichment (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX IF NOT EXISTS title_enrichment_source_idx
  ON title_enrichment (source, fetched_at);

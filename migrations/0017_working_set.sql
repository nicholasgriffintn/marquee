CREATE TABLE IF NOT EXISTS title_working_set (
  title_id TEXT PRIMARY KEY,
  refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS title_working_set_refreshed_idx
  ON title_working_set (refreshed_at);

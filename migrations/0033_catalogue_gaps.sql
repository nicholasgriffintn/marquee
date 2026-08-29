CREATE TABLE catalogue_gap_lookups (
  query_key TEXT PRIMARY KEY,
  looked_up_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalogue_gap_lookups_recent_idx ON catalogue_gap_lookups (looked_up_at);

CREATE TABLE catalogue_gap_titles (
  imdb_id TEXT PRIMARY KEY,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalogue_gap_titles_recent_idx ON catalogue_gap_titles (queued_at);

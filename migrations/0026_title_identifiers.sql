ALTER TABLE catalog_title_external_ids ADD COLUMN letterboxd_id TEXT;
ALTER TABLE catalog_title_external_ids ADD COLUMN rotten_tomatoes_id TEXT;
ALTER TABLE catalog_title_external_ids ADD COLUMN metacritic_id TEXT;
ALTER TABLE catalog_title_external_ids ADD COLUMN trakt_id TEXT;

CREATE TABLE title_identifier_syncs (
  title_id TEXT PRIMARY KEY,
  matched INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

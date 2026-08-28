CREATE TABLE catalog_places (
  entity_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  precision_degrees REAL NOT NULL DEFAULT 1,
  country_id TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalog_places_country_idx ON catalog_places (country_id, entity_id);

CREATE TABLE catalog_title_places (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  place_id TEXT NOT NULL,
  PRIMARY KEY (title_id, kind, place_id)
);

CREATE INDEX catalog_title_places_place_idx ON catalog_title_places (place_id, title_id);

CREATE TABLE catalog_title_place_sync (
  title_id TEXT PRIMARY KEY,
  places INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalog_title_place_sync_stale_idx ON catalog_title_place_sync (places, synced_at);

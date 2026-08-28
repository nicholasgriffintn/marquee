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
  kind TEXT NOT NULL CHECK (kind IN ('filming', 'narrative')),
  place_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'wikidata' CHECK (length(trim(source)) > 0),
  PRIMARY KEY (title_id, kind, place_id, source)
);

CREATE INDEX catalog_title_places_place_idx ON catalog_title_places (place_id, title_id);

CREATE TABLE catalog_title_place_sync (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  places INTEGER NOT NULL DEFAULT 0 CHECK (places >= 0),
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX catalog_title_place_sync_stale_idx
  ON catalog_title_place_sync (source, places, synced_at);

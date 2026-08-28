CREATE TABLE catalog_title_places_next (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('filming', 'narrative')),
  place_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'wikidata' CHECK (length(trim(source)) > 0),
  PRIMARY KEY (title_id, kind, place_id, source)
);

INSERT INTO catalog_title_places_next (title_id, kind, place_id, source)
SELECT title_id, kind, place_id, 'wikidata'
FROM catalog_title_places
WHERE kind IN ('filming', 'narrative');

DROP TABLE catalog_title_places;

ALTER TABLE catalog_title_places_next RENAME TO catalog_title_places;

CREATE INDEX catalog_title_places_place_idx ON catalog_title_places (place_id, title_id);

CREATE TABLE catalog_title_place_sync_next (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  places INTEGER NOT NULL DEFAULT 0 CHECK (places >= 0),
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

INSERT INTO catalog_title_place_sync_next (title_id, source, places, synced_at)
SELECT title_id, 'wikidata', max(places, 0), synced_at FROM catalog_title_place_sync;

DROP TABLE catalog_title_place_sync;

ALTER TABLE catalog_title_place_sync_next RENAME TO catalog_title_place_sync;

CREATE INDEX catalog_title_place_sync_stale_idx
  ON catalog_title_place_sync (source, places, synced_at);

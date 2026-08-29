ALTER TABLE catalog_people SET (fillfactor = 90);

DROP INDEX IF EXISTS catalog_people_popularity_idx;

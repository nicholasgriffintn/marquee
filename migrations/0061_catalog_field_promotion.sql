ALTER TABLE catalog_titles ADD COLUMN runtime_minutes INTEGER;
ALTER TABLE catalog_titles ADD COLUMN release_date TEXT;
ALTER TABLE catalog_titles ADD COLUMN certification TEXT;
ALTER TABLE catalog_titles ADD COLUMN status TEXT;
ALTER TABLE catalog_titles ADD COLUMN original_language TEXT;
ALTER TABLE catalog_titles ADD COLUMN revenue INTEGER;
ALTER TABLE catalog_titles ADD COLUMN collection_id INTEGER;
ALTER TABLE catalog_titles ADD COLUMN collection_name TEXT;
ALTER TABLE catalog_titles ADD COLUMN mal_id INTEGER;
ALTER TABLE catalog_titles ADD COLUMN anilist_id INTEGER;
ALTER TABLE catalog_titles ADD COLUMN wikidata_id TEXT;

UPDATE catalog_titles SET
  runtime_minutes = CAST(json_extract(payload, '$.runtimeMinutes') AS INTEGER),
  release_date = json_extract(payload, '$.releaseDate'),
  certification = json_extract(payload, '$.certification'),
  status = json_extract(payload, '$.status'),
  original_language = json_extract(payload, '$.originalLanguage'),
  revenue = CAST(json_extract(payload, '$.revenue') AS INTEGER),
  collection_id = CAST(json_extract(payload, '$.collection.id') AS INTEGER),
  collection_name = json_extract(payload, '$.collection.name'),
  mal_id = CAST(json_extract(payload, '$.externalIds.malId') AS INTEGER),
  anilist_id = CAST(json_extract(payload, '$.externalIds.anilistId') AS INTEGER),
  wikidata_id = json_extract(payload, '$.externalIds.wikidataId');

DROP INDEX IF EXISTS catalog_titles_collection_idx;
DROP INDEX IF EXISTS catalog_titles_mal_idx;
DROP INDEX IF EXISTS catalog_titles_movie_revenue_idx;

CREATE INDEX IF NOT EXISTS catalog_titles_collection_idx
  ON catalog_titles (collection_id, release_date);

CREATE INDEX IF NOT EXISTS catalog_titles_mal_idx
  ON catalog_titles (mal_id);

CREATE INDEX IF NOT EXISTS catalog_titles_anilist_idx
  ON catalog_titles (anilist_id);

CREATE INDEX IF NOT EXISTS catalog_titles_wikidata_idx
  ON catalog_titles (wikidata_id);

CREATE INDEX IF NOT EXISTS catalog_titles_movie_revenue_idx
  ON catalog_titles (media_type, revenue, blended_rating);

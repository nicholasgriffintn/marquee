ALTER TABLE catalog_titles ADD COLUMN overview TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_titles ADD COLUMN release_date TEXT;
ALTER TABLE catalog_titles ADD COLUMN runtime_minutes INTEGER;
ALTER TABLE catalog_titles ADD COLUMN number_of_seasons INTEGER;
ALTER TABLE catalog_titles ADD COLUMN certification TEXT;
ALTER TABLE catalog_titles ADD COLUMN status TEXT;
ALTER TABLE catalog_titles ADD COLUMN original_language TEXT;
ALTER TABLE catalog_titles ADD COLUMN tmdb_score REAL;
ALTER TABLE catalog_titles ADD COLUMN poster_url TEXT;
ALTER TABLE catalog_titles ADD COLUMN backdrop_url TEXT;
ALTER TABLE catalog_titles ADD COLUMN watch_link TEXT;
ALTER TABLE catalog_titles ADD COLUMN revenue INTEGER;
ALTER TABLE catalog_titles ADD COLUMN collection_id INTEGER;
ALTER TABLE catalog_titles ADD COLUMN collection_name TEXT;
ALTER TABLE catalog_titles ADD COLUMN mal_id INTEGER;
ALTER TABLE catalog_titles ADD COLUMN anilist_id INTEGER;
ALTER TABLE catalog_titles ADD COLUMN wikidata_id TEXT;

UPDATE catalog_titles SET
  overview = COALESCE(json_extract(payload, '$.overview'), ''),
  release_date = json_extract(payload, '$.releaseDate'),
  runtime_minutes = json_extract(payload, '$.runtimeMinutes'),
  number_of_seasons = json_extract(payload, '$.numberOfSeasons'),
  certification = json_extract(payload, '$.certification'),
  status = json_extract(payload, '$.status'),
  original_language = json_extract(payload, '$.originalLanguage'),
  tmdb_score = json_extract(payload, '$.tmdbScore'),
  poster_url = json_extract(payload, '$.posterUrl'),
  backdrop_url = json_extract(payload, '$.backdropUrl'),
  watch_link = json_extract(payload, '$.watchLink'),
  revenue = json_extract(payload, '$.revenue'),
  collection_id = json_extract(payload, '$.collection.id'),
  collection_name = json_extract(payload, '$.collection.name'),
  mal_id = json_extract(payload, '$.externalIds.malId'),
  anilist_id = json_extract(payload, '$.externalIds.anilistId'),
  wikidata_id = json_extract(payload, '$.externalIds.wikidataId');

DROP INDEX IF EXISTS catalog_titles_collection_idx;
DROP INDEX IF EXISTS catalog_titles_mal_idx;
DROP INDEX IF EXISTS catalog_titles_movie_revenue_idx;

CREATE INDEX IF NOT EXISTS catalog_titles_collection_idx
  ON catalog_titles (collection_id, release_date);

CREATE INDEX IF NOT EXISTS catalog_titles_mal_idx
  ON catalog_titles (mal_id);

CREATE INDEX IF NOT EXISTS catalog_titles_movie_revenue_idx
  ON catalog_titles (media_type, revenue, blended_rating);

DROP INDEX IF EXISTS catalog_titles_collection_idx;
DROP INDEX IF EXISTS catalog_titles_mal_idx;
DROP INDEX IF EXISTS catalog_titles_movie_revenue_idx;

CREATE INDEX IF NOT EXISTS catalog_titles_collection_idx
  ON catalog_titles (collection_id, release_date);

CREATE INDEX IF NOT EXISTS catalog_titles_mal_idx
  ON catalog_titles (mal_id);

CREATE INDEX IF NOT EXISTS catalog_titles_movie_revenue_idx
  ON catalog_titles (media_type, revenue, blended_rating);

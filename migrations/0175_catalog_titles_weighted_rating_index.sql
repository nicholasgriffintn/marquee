CREATE INDEX IF NOT EXISTS catalog_titles_weighted_rating_idx
  ON catalog_titles (weighted_rating DESC);

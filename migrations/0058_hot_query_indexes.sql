CREATE INDEX IF NOT EXISTS catalog_titles_movie_revenue_idx
  ON catalog_titles (media_type, COALESCE(json_extract(payload, '$.revenue'), 0), blended_rating);

CREATE INDEX IF NOT EXISTS catalog_titles_landed_popularity_idx
  ON catalog_titles (popularity DESC)
  WHERE blended_rating >= 6.2;

CREATE INDEX IF NOT EXISTS title_provider_state_provider_kind_seen_idx
  ON title_provider_state (provider_id, offer_kind, first_seen_at);

CREATE INDEX IF NOT EXISTS revival_works_source_updated_idx
  ON revival_works (source, updated_at);

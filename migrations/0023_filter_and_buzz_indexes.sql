CREATE INDEX catalog_title_genres_lower_genre_idx ON catalog_title_genres (lower(genre), title_id);

CREATE INDEX catalog_title_keywords_lower_keyword_idx ON catalog_title_keywords (lower(keyword), title_id);

CREATE INDEX catalog_places_lower_label_idx ON catalog_places (lower(label), entity_id);

CREATE INDEX catalog_titles_rail_popularity_idx ON catalog_titles (popularity DESC)
  WHERE blended_rating >= 6.5 AND vote_count >= 100;

ALTER TABLE title_buzz ADD COLUMN buzz_rank DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE title_buzz SET buzz_rank = GREATEST(world_score, score)
  WHERE buzz_rank IS DISTINCT FROM GREATEST(world_score, score);

CREATE INDEX title_buzz_rank_idx ON title_buzz (buzz_rank DESC) WHERE article <> '' AND views >= 500;

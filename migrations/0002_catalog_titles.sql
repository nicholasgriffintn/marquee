CREATE TABLE "catalog_titles" (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  year INTEGER,
  popularity REAL NOT NULL DEFAULT 0,
  source_updated_at TEXT NOT NULL,
  enriched_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, imdb_id TEXT, poster_key TEXT, vote_count INTEGER NOT NULL DEFAULT 0, weighted_rating REAL NOT NULL DEFAULT 0, blended_rating REAL NOT NULL DEFAULT 0, availability_claimed_at TEXT, overview TEXT NOT NULL DEFAULT '', release_date TEXT, runtime_minutes INTEGER, number_of_seasons INTEGER, certification TEXT, status TEXT, original_language TEXT, tmdb_score REAL, poster_url TEXT, backdrop_url TEXT, watch_link TEXT, revenue INTEGER, collection_id INTEGER, collection_name TEXT, mal_id INTEGER, anilist_id INTEGER, wikidata_id TEXT,
  UNIQUE (media_type, tmdb_id)
);

CREATE INDEX catalog_titles_collection_idx ON catalog_titles (collection_id, release_date);

CREATE INDEX catalog_titles_imdb_idx ON catalog_titles (imdb_id);

CREATE INDEX catalog_titles_landed_popularity_idx ON catalog_titles (popularity DESC) WHERE blended_rating >= 6.2;

CREATE INDEX catalog_titles_mal_idx ON catalog_titles (mal_id);

CREATE INDEX catalog_titles_movie_revenue_idx ON catalog_titles (media_type, revenue, blended_rating);

CREATE INDEX catalog_titles_popularity_idx ON catalog_titles (popularity DESC);

CREATE INDEX catalog_titles_title_idx ON catalog_titles (title COLLATE NOCASE);

CREATE INDEX catalog_titles_type_popularity_idx ON catalog_titles (media_type, popularity DESC);

CREATE INDEX catalog_titles_updated_idx ON catalog_titles (updated_at);

CREATE INDEX catalog_titles_weighted_rating_idx ON catalog_titles (weighted_rating DESC);

CREATE TRIGGER catalog_titles_search_insert
AFTER INSERT ON catalog_titles
BEGIN
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid, new.title, new.original_title, new.overview,
    COALESCE((SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), '') || ' ' ||
    COALESCE((SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''),
    COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = new.id), ''),
    new.id
  );
END;

CREATE TRIGGER catalog_titles_search_update
AFTER UPDATE ON catalog_titles
BEGIN
  DELETE FROM catalog_search WHERE rowid = old.rowid;
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid, new.title, new.original_title, new.overview,
    COALESCE((SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), '') || ' ' ||
    COALESCE((SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''),
    COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = new.id), ''),
    new.id
  );
END;

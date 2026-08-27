CREATE TABLE IF NOT EXISTS catalog_title_genres (
  title_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, genre)
);

CREATE INDEX IF NOT EXISTS catalog_title_genres_genre_idx
  ON catalog_title_genres (genre, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_keywords (
  title_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, keyword)
);

CREATE INDEX IF NOT EXISTS catalog_title_keywords_keyword_idx
  ON catalog_title_keywords (keyword, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_studios (
  title_id TEXT NOT NULL,
  studio TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, studio)
);

CREATE INDEX IF NOT EXISTS catalog_title_studios_studio_idx
  ON catalog_title_studios (studio, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_people (
  title_id TEXT NOT NULL,
  person TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, person)
);

CREATE TABLE IF NOT EXISTS catalog_title_recommendation_ids (
  title_id TEXT NOT NULL,
  recommended_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, recommended_id)
);

CREATE TABLE IF NOT EXISTS catalog_title_countries (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'origin', 'production')),
  country TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, country)
);

CREATE TABLE IF NOT EXISTS catalog_title_languages (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'spoken')),
  language TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, language)
);

CREATE TABLE IF NOT EXISTS catalog_title_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

CREATE TABLE IF NOT EXISTS catalog_title_providers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  web_url TEXT,
  source TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id)
);

CREATE TABLE IF NOT EXISTS catalog_title_provider_offers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id, offer_type)
);

CREATE INDEX IF NOT EXISTS catalog_title_provider_offers_type_idx
  ON catalog_title_provider_offers (offer_type, provider_id, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_details (
  title_id TEXT PRIMARY KEY,
  homepage TEXT,
  trailer_key TEXT,
  tagline TEXT,
  budget INTEGER,
  episode_count INTEGER,
  last_air_date TEXT,
  next_air_date TEXT,
  pending INTEGER
);

CREATE TABLE IF NOT EXISTS catalog_title_ratings (
  title_id TEXT PRIMARY KEY,
  imdb_score REAL,
  imdb_votes INTEGER,
  rotten_tomatoes TEXT,
  metascore INTEGER,
  awards TEXT,
  award_wins INTEGER,
  box_office INTEGER,
  anime_score REAL,
  anime_votes INTEGER
);

CREATE TABLE IF NOT EXISTS catalog_title_external_ids (
  title_id TEXT PRIMARY KEY,
  tvdb_id INTEGER,
  facebook_id TEXT,
  instagram_id TEXT,
  twitter_id TEXT,
  anidb_id INTEGER,
  kitsu_id INTEGER,
  ani_search_id INTEGER,
  anime_planet_id TEXT,
  livechart_id INTEGER,
  animenewsnetwork_id INTEGER,
  animecountdown_id INTEGER
);

CREATE TABLE catalog_titles (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  year INTEGER,
  popularity DOUBLE PRECISION NOT NULL DEFAULT 0,
  source_updated_at TIMESTAMPTZ NOT NULL,
  enriched_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imdb_id TEXT,
  poster_key TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0,
  weighted_rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  blended_rating DOUBLE PRECISION NOT NULL DEFAULT 0,
  availability_claimed_at TIMESTAMPTZ,
  overview TEXT NOT NULL DEFAULT '',
  release_date DATE,
  runtime_minutes INTEGER,
  number_of_seasons INTEGER,
  certification TEXT,
  status TEXT,
  original_language TEXT,
  tmdb_score DOUBLE PRECISION,
  poster_url TEXT,
  backdrop_url TEXT,
  watch_link TEXT,
  revenue BIGINT,
  collection_id INTEGER,
  collection_name TEXT,
  mal_id INTEGER,
  anilist_id INTEGER,
  wikidata_id TEXT,
  UNIQUE (media_type, tmdb_id)
);

CREATE INDEX catalog_titles_collection_idx ON catalog_titles (collection_id, release_date);
CREATE INDEX catalog_titles_imdb_idx ON catalog_titles (imdb_id);
CREATE INDEX catalog_titles_landed_popularity_idx ON catalog_titles (popularity DESC) WHERE blended_rating >= 6.2;
CREATE INDEX catalog_titles_mal_idx ON catalog_titles (mal_id);
CREATE INDEX catalog_titles_movie_revenue_idx ON catalog_titles (media_type, revenue, blended_rating);
CREATE INDEX catalog_titles_popularity_idx ON catalog_titles (popularity DESC);
CREATE INDEX catalog_titles_title_idx ON catalog_titles (lower(title));
CREATE INDEX catalog_titles_type_popularity_idx ON catalog_titles (media_type, popularity DESC);
CREATE INDEX catalog_titles_updated_idx ON catalog_titles (updated_at);
CREATE INDEX catalog_titles_weighted_rating_idx ON catalog_titles (weighted_rating DESC);

CREATE TABLE catalog_title_genres (
  title_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, genre)
);

CREATE INDEX catalog_title_genres_genre_idx ON catalog_title_genres (genre, title_id);

CREATE TABLE catalog_title_keywords (
  title_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, keyword)
);

CREATE INDEX catalog_title_keywords_keyword_idx ON catalog_title_keywords (keyword, title_id);

CREATE TABLE catalog_title_studios (
  title_id TEXT NOT NULL,
  studio TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, studio)
);

CREATE INDEX catalog_title_studios_studio_idx ON catalog_title_studios (studio, title_id);

CREATE TABLE catalog_title_people (
  title_id TEXT NOT NULL,
  person TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, person)
);

CREATE TABLE catalog_title_recommendation_ids (
  title_id TEXT NOT NULL,
  recommended_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, recommended_id)
);

CREATE TABLE catalog_title_countries (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'origin', 'production')),
  country TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, country)
);

CREATE TABLE catalog_title_languages (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'spoken')),
  language TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, language)
);

CREATE TABLE catalog_title_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

CREATE TABLE catalog_title_providers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  web_url TEXT,
  source TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id)
);

CREATE TABLE catalog_title_provider_offers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id, offer_type)
);

CREATE INDEX catalog_title_provider_offers_type_idx ON catalog_title_provider_offers (offer_type, provider_id, title_id);

CREATE TABLE catalog_title_details (
  title_id TEXT PRIMARY KEY,
  homepage TEXT,
  trailer_key TEXT,
  tagline TEXT,
  budget BIGINT,
  episode_count INTEGER,
  last_air_date DATE,
  next_air_date DATE,
  pending SMALLINT CHECK (pending IS NULL OR pending IN (0, 1))
);

CREATE TABLE catalog_title_ratings (
  title_id TEXT PRIMARY KEY,
  imdb_score DOUBLE PRECISION,
  imdb_votes INTEGER,
  rotten_tomatoes TEXT,
  metascore INTEGER,
  awards TEXT,
  award_wins INTEGER,
  box_office BIGINT,
  anime_score DOUBLE PRECISION,
  anime_votes INTEGER
);

CREATE TABLE catalog_title_external_ids (
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
  animecountdown_id INTEGER,
  letterboxd_id TEXT,
  rotten_tomatoes_id TEXT,
  metacritic_id TEXT,
  trakt_id TEXT
);

CREATE TABLE catalog_title_anime (
  title_id TEXT PRIMARY KEY,
  format TEXT,
  episodes INTEGER,
  duration_minutes INTEGER,
  season TEXT,
  season_year INTEGER,
  source TEXT,
  romaji_title TEXT,
  english_title TEXT,
  native_title TEXT,
  broadcast TEXT,
  airing SMALLINT CHECK (airing IS NULL OR airing IN (0, 1)),
  background TEXT,
  rank INTEGER,
  popularity INTEGER,
  members INTEGER,
  favorites INTEGER,
  key_visual_url TEXT,
  status_breakdown_watching INTEGER,
  status_breakdown_completed INTEGER,
  status_breakdown_on_hold INTEGER,
  status_breakdown_dropped INTEGER,
  status_breakdown_plan_to_watch INTEGER
);

CREATE TABLE catalog_title_anime_synonyms (
  title_id TEXT NOT NULL,
  synonym TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, synonym)
);

CREATE TABLE catalog_title_anime_relations (
  title_id TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  format TEXT,
  title TEXT NOT NULL,
  year INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, mal_id, relation)
);

CREATE TABLE catalog_title_anime_streams (
  title_id TEXT NOT NULL,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, site)
);

CREATE TABLE catalog_title_anime_characters (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  voice_actor TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name, role)
);

CREATE TABLE catalog_title_anime_staff (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name, role)
);

CREATE TABLE catalog_title_anime_themes (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'ending')),
  title TEXT NOT NULL,
  artist TEXT,
  episodes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, position)
);

CREATE TABLE catalog_title_anime_companies (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('licensor', 'producer')),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, name)
);

CREATE TABLE catalog_title_anime_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

CREATE TABLE catalog_title_anime_recommendations (
  title_id TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, mal_id)
);

CREATE TABLE catalog_title_anime_links (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name)
);

CREATE TABLE catalog_credits (
  credit_id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  person_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  job TEXT,
  character TEXT,
  billing INTEGER,
  season_number INTEGER,
  episode_number INTEGER,
  episode_count INTEGER
);

CREATE INDEX catalog_credits_person_idx ON catalog_credits (person_id);
CREATE INDEX catalog_credits_title_idx ON catalog_credits (title_id, season_number, episode_number, department, billing);

CREATE TABLE catalog_people (
  person_id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  original_name TEXT,
  known_for TEXT,
  gender INTEGER,
  profile_path TEXT,
  popularity DOUBLE PRECISION,
  titles INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX catalog_people_lower_name_idx ON catalog_people (lower(name));
CREATE INDEX catalog_people_name_idx ON catalog_people (name, titles DESC);
CREATE INDEX catalog_people_popularity_idx ON catalog_people (popularity DESC);

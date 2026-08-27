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
  airing INTEGER,
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

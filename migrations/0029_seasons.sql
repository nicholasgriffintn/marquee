CREATE TABLE IF NOT EXISTS catalog_seasons (
  title_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  overview TEXT NOT NULL DEFAULT '',
  air_date TEXT,
  episode_count INTEGER NOT NULL DEFAULT 0,
  poster_url TEXT,
  payload TEXT NOT NULL DEFAULT '[]',
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  episodes_fetched_at TEXT,
  PRIMARY KEY (title_id, season_number)
);

CREATE INDEX IF NOT EXISTS catalog_seasons_fetched_idx
  ON catalog_seasons (fetched_at);

CREATE TABLE IF NOT EXISTS viewing_episode_entries (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('season', 'episode')),
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL DEFAULT 0,
  watched INTEGER NOT NULL DEFAULT 0,
  watched_at TEXT,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (viewer_id, title_id, scope, season_number, episode_number)
);

CREATE INDEX IF NOT EXISTS viewing_episode_entries_title_idx
  ON viewing_episode_entries (viewer_id, title_id, season_number, episode_number);

CREATE INDEX IF NOT EXISTS viewing_episode_entries_updated_idx
  ON viewing_episode_entries (viewer_id, updated_at DESC);

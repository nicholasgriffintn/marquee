CREATE TABLE catalog_seasons (
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

CREATE INDEX catalog_seasons_fetched_idx
  ON catalog_seasons (fetched_at);

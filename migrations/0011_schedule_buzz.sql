CREATE TABLE title_schedule (
  id TEXT PRIMARY KEY,
  title_id TEXT,
  imdb_id TEXT,
  show_name TEXT NOT NULL,
  season INTEGER,
  episode INTEGER,
  episode_name TEXT,
  airs_at TEXT NOT NULL,
  network TEXT,
  source TEXT NOT NULL DEFAULT 'tvmaze',
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX title_schedule_airs_idx ON title_schedule (airs_at);

CREATE INDEX title_schedule_title_idx ON title_schedule (title_id);

CREATE TABLE title_buzz (
  title_id TEXT PRIMARY KEY,
  article TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  previous_views INTEGER NOT NULL DEFAULT 0,
  delta REAL NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, source TEXT NOT NULL DEFAULT 'search', score REAL NOT NULL DEFAULT 0);

CREATE INDEX title_buzz_delta_idx ON title_buzz (delta DESC);

CREATE INDEX title_buzz_measured_idx
  ON title_buzz (measured_at);

CREATE INDEX title_buzz_score_idx ON title_buzz (score DESC);

CREATE INDEX title_buzz_views_idx ON title_buzz (views DESC);

CREATE TABLE title_working_set (
  title_id TEXT PRIMARY KEY,
  refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, demand INTEGER NOT NULL DEFAULT 1);

CREATE INDEX title_working_set_demand_idx
  ON title_working_set (demand);

CREATE INDEX title_working_set_refreshed_idx
  ON title_working_set (refreshed_at);

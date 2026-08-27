CREATE TABLE "viewing_entries" (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'watched', 'dropped')),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  thoughts TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (viewer_id, title_id)
);

CREATE INDEX viewing_entries_title_idx ON viewing_entries (title_id);

CREATE INDEX viewing_entries_viewer_status_idx
  ON viewing_entries (viewer_id, status, updated_at DESC);

CREATE INDEX viewing_entries_viewer_updated_idx
  ON viewing_entries (viewer_id, updated_at DESC);

CREATE TABLE "viewing_episode_entries" (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX viewing_episode_entries_title_idx
  ON viewing_episode_entries (viewer_id, title_id, season_number, episode_number);

CREATE INDEX viewing_episode_entries_updated_idx
  ON viewing_episode_entries (viewer_id, updated_at DESC);

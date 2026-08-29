CREATE TABLE viewing_entries (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'watched', 'dropped')),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  thoughts TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (viewer_id, title_id)
);

CREATE INDEX viewing_entries_title_idx ON viewing_entries (title_id);
CREATE INDEX viewing_entries_viewer_status_idx ON viewing_entries (viewer_id, status, updated_at DESC);
CREATE INDEX viewing_entries_viewer_updated_idx ON viewing_entries (viewer_id, updated_at DESC);

CREATE TABLE viewing_episode_entries (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('season', 'episode')),
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL DEFAULT 0,
  watched SMALLINT NOT NULL DEFAULT 0 CHECK (watched IN (0, 1)),
  watched_at TIMESTAMPTZ,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (viewer_id, title_id, scope, season_number, episode_number)
);

CREATE INDEX viewing_episode_entries_title_idx ON viewing_episode_entries (viewer_id, title_id, season_number, episode_number);
CREATE INDEX viewing_episode_entries_updated_idx ON viewing_episode_entries (viewer_id, updated_at DESC);

CREATE TABLE viewer_preferences (
  viewer_id TEXT PRIMARY KEY,
  selected_provider_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE viewer_guests (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vetoes TEXT NOT NULL DEFAULT '[]',
  leanings TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX viewer_guests_viewer_idx ON viewer_guests (viewer_id, created_at);

CREATE TABLE viewer_alerts (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  title_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind, alert_key)
);

CREATE INDEX viewer_alerts_recent_idx ON viewer_alerts (viewer_id, sent_at DESC);

CREATE TABLE viewer_alert_settings (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled SMALLINT NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  channel TEXT NOT NULL DEFAULT 'email',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind)
);

CREATE TABLE viewer_digests (
  viewer_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE viewer_feeds (
  token_hash TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX viewer_feeds_viewer_idx ON viewer_feeds (viewer_id);

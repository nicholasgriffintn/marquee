-- Recreate viewer-owned tables with ON DELETE CASCADE on their viewer_id/user_id
-- column, matching the pattern already used by identities/sessions/api_tokens/viewer_feeds.
-- SQLite has no ALTER TABLE ADD CONSTRAINT, so each table is rebuilt in place.
-- Rows whose viewer_id no longer matches a user are dropped as part of the rebuild.

CREATE TABLE viewing_entries_new (
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

INSERT INTO viewing_entries_new
  SELECT id, viewer_id, title_id, status, rating, thoughts, created_at, updated_at
  FROM viewing_entries
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewing_entries;
ALTER TABLE viewing_entries_new RENAME TO viewing_entries;

CREATE INDEX IF NOT EXISTS viewing_entries_viewer_updated_idx
  ON viewing_entries (viewer_id, updated_at DESC);

CREATE TABLE pinned_shelves_new (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  title_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO pinned_shelves_new
  SELECT id, viewer_id, name, prompt, reason, title_ids, created_at
  FROM pinned_shelves
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE pinned_shelves;
ALTER TABLE pinned_shelves_new RENAME TO pinned_shelves;

CREATE INDEX IF NOT EXISTS pinned_shelves_viewer_idx
  ON pinned_shelves (viewer_id, created_at DESC);

CREATE TABLE viewer_signals_new (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_id TEXT,
  journey_id TEXT,
  context TEXT NOT NULL DEFAULT '{}',
  weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);

INSERT INTO viewer_signals_new
  SELECT id, viewer_id, type, title_id, journey_id, context, weight, created_at, expires_at
  FROM viewer_signals
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_signals;
ALTER TABLE viewer_signals_new RENAME TO viewer_signals;

CREATE INDEX IF NOT EXISTS viewer_signals_lookup_idx
  ON viewer_signals (viewer_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS viewer_signals_journey_idx
  ON viewer_signals (journey_id);
CREATE INDEX IF NOT EXISTS viewer_signals_expiry_idx
  ON viewer_signals (expires_at);

CREATE TABLE viewer_beliefs_new (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.5,
  scope TEXT NOT NULL DEFAULT 'always'
    CHECK (scope IN ('always', 'tonight', 'week')),
  source_rule TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  suspended_until TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO viewer_beliefs_new
  SELECT id, viewer_id, key, value, strength, confidence, scope, source_rule, edited,
         suspended_until, expires_at, revoked_at, created_at, updated_at
  FROM viewer_beliefs
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_beliefs;
ALTER TABLE viewer_beliefs_new RENAME TO viewer_beliefs;

CREATE UNIQUE INDEX IF NOT EXISTS viewer_beliefs_key_idx
  ON viewer_beliefs (viewer_id, key);
CREATE INDEX IF NOT EXISTS viewer_beliefs_active_idx
  ON viewer_beliefs (viewer_id, revoked_at);

CREATE TABLE viewer_guests_new (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vetoes TEXT NOT NULL DEFAULT '[]',
  leanings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO viewer_guests_new
  SELECT id, viewer_id, name, vetoes, leanings, created_at
  FROM viewer_guests
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_guests;
ALTER TABLE viewer_guests_new RENAME TO viewer_guests;

CREATE INDEX IF NOT EXISTS viewer_guests_viewer_idx
  ON viewer_guests (viewer_id, created_at);

CREATE TABLE viewer_alerts_new (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  title_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind, alert_key)
);

INSERT INTO viewer_alerts_new
  SELECT viewer_id, kind, alert_key, title_id, channel, detail, sent_at
  FROM viewer_alerts
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_alerts;
ALTER TABLE viewer_alerts_new RENAME TO viewer_alerts;

CREATE INDEX IF NOT EXISTS viewer_alerts_recent_idx
  ON viewer_alerts (viewer_id, sent_at DESC);

CREATE TABLE viewer_alert_settings_new (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'email',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind)
);

INSERT INTO viewer_alert_settings_new
  SELECT viewer_id, kind, enabled, channel, updated_at
  FROM viewer_alert_settings
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_alert_settings;
ALTER TABLE viewer_alert_settings_new RENAME TO viewer_alert_settings;

CREATE TABLE viewer_usher_new (
  viewer_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in-progress', 'done', 'dismissed')),
  asked TEXT NOT NULL DEFAULT '[]',
  muted TEXT NOT NULL DEFAULT '{}',
  ignored INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT,
  last_prompted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO viewer_usher_new
  SELECT viewer_id, status, asked, muted, ignored, snoozed_until, last_prompted_at, updated_at
  FROM viewer_usher
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_usher;
ALTER TABLE viewer_usher_new RENAME TO viewer_usher;

CREATE TABLE viewer_answers_new (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, question_id)
);

INSERT INTO viewer_answers_new
  SELECT viewer_id, question_id, answer, answered_at
  FROM viewer_answers
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewer_answers;
ALTER TABLE viewer_answers_new RENAME TO viewer_answers;

CREATE TABLE rail_feedback_new (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rail_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('good', 'bad')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, rail_id)
);

INSERT INTO rail_feedback_new
  SELECT viewer_id, rail_id, verdict, created_at
  FROM rail_feedback
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE rail_feedback;
ALTER TABLE rail_feedback_new RENAME TO rail_feedback;

CREATE TABLE linked_accounts_new (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  account_label TEXT,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT,
  PRIMARY KEY (viewer_id, provider)
);

INSERT INTO linked_accounts_new
  SELECT viewer_id, provider, access_token, refresh_token, expires_at, account_label,
         linked_at, synced_at
  FROM linked_accounts
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE linked_accounts;
ALTER TABLE linked_accounts_new RENAME TO linked_accounts;

CREATE TABLE viewing_episode_entries_new (
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

INSERT INTO viewing_episode_entries_new
  SELECT id, viewer_id, title_id, scope, season_number, episode_number, watched, watched_at,
         rating, notes, created_at, updated_at
  FROM viewing_episode_entries
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE viewing_episode_entries;
ALTER TABLE viewing_episode_entries_new RENAME TO viewing_episode_entries;

CREATE INDEX IF NOT EXISTS viewing_episode_entries_title_idx
  ON viewing_episode_entries (viewer_id, title_id, season_number, episode_number);
CREATE INDEX IF NOT EXISTS viewing_episode_entries_updated_idx
  ON viewing_episode_entries (viewer_id, updated_at DESC);

CREATE TABLE revival_progress_new (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES revival_works(id) ON DELETE CASCADE,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, work_id)
);

INSERT INTO revival_progress_new
  SELECT viewer_id, work_id, position_seconds, finished, updated_at
  FROM revival_progress
  WHERE viewer_id IN (SELECT id FROM users);

DROP TABLE revival_progress;
ALTER TABLE revival_progress_new RENAME TO revival_progress;

CREATE INDEX IF NOT EXISTS revival_progress_viewer_idx
  ON revival_progress (viewer_id, updated_at DESC);

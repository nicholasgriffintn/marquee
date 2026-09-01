CREATE TABLE viewer_import_runs (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  source_subject TEXT NOT NULL DEFAULT '',
  input_kind TEXT NOT NULL CHECK (
    input_kind IN (
      'connected_api',
      'official_export',
      'generic_json',
      'generic_csv'
    )
  ),
  adapter_id TEXT NOT NULL CHECK (adapter_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  adapter_version INTEGER NOT NULL CHECK (adapter_version > 0),
  input_fingerprint TEXT NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'staging' CHECK (
    status IN (
      'staging',
      'matching',
      'ready',
      'committing',
      'needs_review',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  received INTEGER NOT NULL DEFAULT 0 CHECK (received >= 0),
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched >= 0),
  review INTEGER NOT NULL DEFAULT 0 CHECK (review >= 0),
  skipped INTEGER NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  duplicate INTEGER NOT NULL DEFAULT 0 CHECK (duplicate >= 0),
  committed INTEGER NOT NULL DEFAULT 0 CHECK (committed >= 0),
  failed INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
  cursor TEXT,
  error_code TEXT,
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  UNIQUE (
    viewer_id,
    source,
    source_subject,
    input_fingerprint,
    adapter_id,
    adapter_version
  )
);

CREATE INDEX viewer_import_runs_viewer_idx
  ON viewer_import_runs (viewer_id, created_at DESC);

CREATE INDEX viewer_import_runs_status_idx
  ON viewer_import_runs (status, updated_at);

CREATE TABLE viewer_import_records (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES viewer_import_runs(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_event_id TEXT NOT NULL CHECK (char_length(source_event_id) BETWEEN 1 AND 160),
  event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_item_id TEXT,
  media_type TEXT CHECK (media_type IS NULL OR media_type IN ('movie', 'tv')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  original_title TEXT,
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1870 AND 2100),
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  season_number INTEGER CHECK (season_number IS NULL OR season_number BETWEEN 0 AND 100),
  episode_number INTEGER CHECK (episode_number IS NULL OR episode_number BETWEEN 0 AND 2000),
  watched_at TIMESTAMPTZ,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  match_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    match_status IN ('pending', 'matched', 'review', 'unmatched', 'ignored', 'committed')
  ),
  title_id TEXT,
  match_method TEXT CHECK (
    match_method IS NULL OR match_method IN ('tmdb', 'imdb', 'tvdb', 'remembered', 'title_year', 'manual')
  ),
  candidate_title_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, source_event_id)
);

CREATE INDEX viewer_import_records_run_status_idx
  ON viewer_import_records (run_id, match_status, created_at);

CREATE INDEX viewer_import_records_viewer_idx
  ON viewer_import_records (viewer_id, created_at DESC);

CREATE TABLE viewing_events (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  source_subject TEXT NOT NULL DEFAULT '',
  source_event_id TEXT NOT NULL CHECK (char_length(source_event_id) BETWEEN 1 AND 160),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('status', 'watch', 'rating', 'episode_watch', 'episode_rating', 'remove')
  ),
  status TEXT CHECK (status IS NULL OR status IN ('watchlist', 'watching', 'watched', 'dropped')),
  watched SMALLINT CHECK (watched IS NULL OR watched IN (0, 1)),
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  watched_at TIMESTAMPTZ,
  season_number INTEGER CHECK (season_number IS NULL OR season_number BETWEEN 0 AND 100),
  episode_number INTEGER CHECK (episode_number IS NULL OR episode_number BETWEEN 0 AND 2000),
  import_run_id TEXT REFERENCES viewer_import_runs(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (event_type <> 'status' OR status IS NOT NULL),
  CHECK (event_type <> 'episode_watch' OR watched IS NOT NULL),
  CHECK (event_type NOT IN ('episode_watch', 'episode_rating') OR (season_number IS NOT NULL AND episode_number IS NOT NULL)),
  UNIQUE (viewer_id, source, source_subject, source_event_id, event_type)
);

CREATE INDEX viewing_events_viewer_title_idx
  ON viewing_events (viewer_id, title_id, occurred_at DESC, recorded_at DESC);

CREATE INDEX viewing_events_import_idx
  ON viewing_events (import_run_id)
  WHERE import_run_id IS NOT NULL;

CREATE TABLE viewer_external_item_matches (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  source_subject TEXT NOT NULL DEFAULT '',
  provider_item_key TEXT NOT NULL CHECK (char_length(provider_item_key) BETWEEN 1 AND 200),
  title_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, source, source_subject, provider_item_key)
);

ALTER TABLE viewing_entries
  ADD COLUMN last_watched_at TIMESTAMPTZ,
  ADD COLUMN status_source TEXT NOT NULL DEFAULT 'marquee',
  ADD COLUMN rating_source TEXT,
  ADD COLUMN projected_at TIMESTAMPTZ;

INSERT INTO viewing_events (
  id,
  viewer_id,
  title_id,
  source,
  source_event_id,
  event_type,
  status,
  occurred_at,
  recorded_at
)
SELECT
  id || ':migration-status',
  viewer_id,
  title_id,
  'marquee',
  id || ':status',
  'status',
  status,
  NULL,
  updated_at
FROM viewing_entries;

INSERT INTO viewing_events (
  id,
  viewer_id,
  title_id,
  source,
  source_event_id,
  event_type,
  rating,
  occurred_at,
  recorded_at
)
SELECT
  id || ':migration-rating',
  viewer_id,
  title_id,
  'marquee',
  id || ':rating',
  'rating',
  rating,
  NULL,
  updated_at
FROM viewing_entries
WHERE rating IS NOT NULL;

INSERT INTO viewing_events (
  id,
  viewer_id,
  title_id,
  source,
  source_event_id,
  event_type,
  watched,
  watched_at,
  season_number,
  episode_number,
  occurred_at,
  recorded_at
)
SELECT
  id || ':migration-watch',
  viewer_id,
  title_id,
  'marquee',
  id || ':watch',
  'episode_watch',
  watched,
  watched_at,
  season_number,
  episode_number,
  watched_at,
  updated_at
FROM viewing_episode_entries
WHERE scope = 'episode';

INSERT INTO viewing_events (
  id,
  viewer_id,
  title_id,
  source,
  source_event_id,
  event_type,
  rating,
  season_number,
  episode_number,
  occurred_at,
  recorded_at
)
SELECT
  id || ':migration-rating',
  viewer_id,
  title_id,
  'marquee',
  id || ':rating',
  'episode_rating',
  rating,
  season_number,
  episode_number,
  NULL,
  updated_at
FROM viewing_episode_entries
WHERE scope = 'episode' AND rating IS NOT NULL;

UPDATE viewing_entries
SET status_source = 'marquee',
    rating_source = CASE WHEN rating IS NULL THEN NULL ELSE 'marquee' END,
    projected_at = CURRENT_TIMESTAMP;

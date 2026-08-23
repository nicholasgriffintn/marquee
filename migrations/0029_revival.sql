CREATE TABLE IF NOT EXISTS revival_works (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_title TEXT NOT NULL,
  year INTEGER,
  director TEXT,
  synopsis TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'movie' CHECK (media_type IN ('movie', 'tv')),
  kind TEXT NOT NULL DEFAULT 'feature' CHECK (kind IN ('feature', 'short', 'episode', 'ephemeral')),
  runtime_seconds INTEGER,
  still_url TEXT,
  stream_url TEXT NOT NULL,
  stream_bytes INTEGER,
  stream_type TEXT NOT NULL DEFAULT 'video/mp4',
  width INTEGER,
  height INTEGER,
  rights_basis TEXT NOT NULL CHECK (
    rights_basis IN ('us-gov', 'pd-mark', 'cc0', 'copyright-expired', 'curated', 'unclear')
  ),
  rights_note TEXT NOT NULL DEFAULT '',
  rights_url TEXT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (
    status IN ('candidate', 'approved', 'rejected')
  ),
  reviewed_by TEXT,
  reviewed_at TEXT,
  title_id TEXT,
  match_confidence REAL NOT NULL DEFAULT 0,
  matched_at TEXT,
  mirror_key TEXT,
  mirror_state TEXT NOT NULL DEFAULT 'remote' CHECK (
    mirror_state IN ('remote', 'copying', 'mirrored', 'failed')
  ),
  mirror_upload_id TEXT,
  mirror_parts TEXT NOT NULL DEFAULT '[]',
  mirror_offset INTEGER NOT NULL DEFAULT 0,
  mirror_error TEXT,
  mirrored_at TEXT,
  plays INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS revival_works_status_idx ON revival_works (status, year DESC);
CREATE INDEX IF NOT EXISTS revival_works_title_idx ON revival_works (title_id);
CREATE INDEX IF NOT EXISTS revival_works_mirror_idx ON revival_works (mirror_state, status);
CREATE INDEX IF NOT EXISTS revival_works_kind_idx ON revival_works (status, kind, plays DESC);
CREATE INDEX IF NOT EXISTS revival_works_sort_idx ON revival_works (status, sort_title);

CREATE TABLE IF NOT EXISTS revival_progress (
  viewer_id TEXT NOT NULL,
  work_id TEXT NOT NULL REFERENCES revival_works(id) ON DELETE CASCADE,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, work_id)
);

CREATE INDEX IF NOT EXISTS revival_progress_viewer_idx
  ON revival_progress (viewer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS revival_source_runs (
  source TEXT PRIMARY KEY,
  cursor TEXT NOT NULL DEFAULT '',
  seen INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  ran_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

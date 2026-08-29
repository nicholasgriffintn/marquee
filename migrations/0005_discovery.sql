CREATE TABLE catalog_sections (
  id TEXT PRIMARY KEY,
  position INTEGER GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  title_ids TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  audience TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE catalog_section_facet_cache (
  kind TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  payload TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX catalog_sections_position_idx ON catalog_sections (position, id);

CREATE TABLE pinned_shelves (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  title_ids TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX pinned_shelves_viewer_idx ON pinned_shelves (viewer_id, created_at DESC);

CREATE TABLE discover_partitions (
  id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  depth INTEGER NOT NULL DEFAULT 0,
  total_results INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  next_page INTEGER NOT NULL DEFAULT 1,
  pages_done INTEGER NOT NULL DEFAULT 0,
  measured_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX discover_partitions_refresh_idx ON discover_partitions (status, completed_at);
CREATE INDEX discover_partitions_status_idx ON discover_partitions (status, end_date DESC);

CREATE TABLE cinemas (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  chain TEXT NOT NULL,
  address TEXT,
  postcode TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  booking_url TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, site_id)
);

CREATE INDEX cinemas_latitude_idx ON cinemas (latitude);
CREATE INDEX cinemas_located_idx ON cinemas (latitude, longitude);
CREATE INDEX cinemas_source_idx ON cinemas (source);

CREATE TABLE cinema_films (
  source TEXT NOT NULL,
  source_film_id TEXT NOT NULL,
  title_id TEXT,
  source_title TEXT NOT NULL,
  source_year INTEGER,
  runtime_minutes INTEGER,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  poster_url TEXT,
  film_url TEXT,
  matched_at TIMESTAMPTZ,
  PRIMARY KEY (source, source_film_id)
);

CREATE INDEX cinema_films_confidence_idx ON cinema_films (confidence);
CREATE INDEX cinema_films_title_idx ON cinema_films (title_id);

CREATE TABLE cinema_screenings (
  id TEXT PRIMARY KEY,
  cinema_id TEXT NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_film_id TEXT NOT NULL,
  title_id TEXT,
  starts_at TIMESTAMPTZ,
  business_day DATE NOT NULL,
  precision TEXT NOT NULL DEFAULT 'exact' CHECK (precision IN ('exact', 'day', 'listing')),
  attributes TEXT NOT NULL DEFAULT '[]',
  booking_url TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX cinema_screenings_cinema_idx ON cinema_screenings (cinema_id, business_day);
CREATE INDEX cinema_screenings_day_idx ON cinema_screenings (business_day);
CREATE INDEX cinema_screenings_film_idx ON cinema_screenings (source, source_film_id);
CREATE INDEX cinema_screenings_title_idx ON cinema_screenings (title_id, business_day);

CREATE TABLE cinema_interest (
  cell TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX cinema_interest_seen_idx ON cinema_interest (last_seen_at DESC);

CREATE TABLE revival_works (
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
  stream_bytes BIGINT,
  stream_type TEXT NOT NULL DEFAULT 'video/mp4',
  width INTEGER,
  height INTEGER,
  country TEXT,
  rights_basis TEXT NOT NULL CHECK (
    rights_basis IN (
      'uk-expired', 'eu-institution', 'cc0', 'us-gov',
      'pd-mark', 'us-expired', 'curated', 'unclear'
    )
  ),
  rights_note TEXT NOT NULL DEFAULT '',
  rights_url TEXT,
  uk_expires_year INTEGER,
  uk_clear SMALLINT NOT NULL DEFAULT 0 CHECK (uk_clear IN (0, 1)),
  rights_checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  title_id TEXT,
  match_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
  matched_at TIMESTAMPTZ,
  mirror_key TEXT,
  mirror_state TEXT NOT NULL DEFAULT 'remote' CHECK (mirror_state IN ('remote', 'copying', 'mirrored', 'failed')),
  mirror_upload_id TEXT,
  mirror_parts TEXT NOT NULL DEFAULT '[]',
  mirror_offset INTEGER NOT NULL DEFAULT 0,
  mirror_error TEXT,
  mirrored_at TIMESTAMPTZ,
  plays INTEGER NOT NULL DEFAULT 0,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_notice TEXT,
  popularity INTEGER,
  downloads INTEGER,
  group_id TEXT,
  group_primary SMALLINT NOT NULL DEFAULT 1 CHECK (group_primary IN (0, 1)),
  synopsis_source TEXT,
  synopsis_article TEXT,
  synopsis_url TEXT,
  described_at TIMESTAMPTZ,
  UNIQUE (source, source_id)
);

CREATE INDEX idx_revival_works_downloads ON revival_works (status, downloads DESC);
CREATE INDEX idx_revival_works_group ON revival_works (group_id, group_primary DESC);
CREATE INDEX idx_revival_works_popularity ON revival_works (status, popularity DESC);
CREATE INDEX idx_revival_works_primary ON revival_works (status, group_primary, popularity DESC);
CREATE INDEX revival_works_described_idx ON revival_works (status, described_at);
CREATE INDEX revival_works_kind_idx ON revival_works (status, kind, plays DESC);
CREATE INDEX revival_works_mirror_idx ON revival_works (mirror_state, status);
CREATE INDEX revival_works_notice_idx ON revival_works (content_notice) WHERE content_notice IS NOT NULL;
CREATE INDEX revival_works_rights_idx ON revival_works (rights_checked_at);
CREATE INDEX revival_works_sort_idx ON revival_works (status, sort_title);
CREATE INDEX revival_works_source_updated_idx ON revival_works (source, updated_at);
CREATE INDEX revival_works_status_idx ON revival_works (status, year DESC);
CREATE INDEX revival_works_title_idx ON revival_works (title_id);
CREATE INDEX revival_works_uk_idx ON revival_works (uk_clear, status);

CREATE TABLE revival_progress (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES revival_works(id) ON DELETE CASCADE,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  finished SMALLINT NOT NULL DEFAULT 0 CHECK (finished IN (0, 1)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, work_id)
);

CREATE INDEX revival_progress_viewer_idx ON revival_progress (viewer_id, updated_at DESC);

CREATE TABLE revival_source_runs (
  source TEXT PRIMARY KEY,
  cursor TEXT NOT NULL DEFAULT '',
  seen INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE revival_tags (
  work_id TEXT NOT NULL REFERENCES revival_works(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('subject', 'genre', 'person', 'language', 'holder')),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (work_id, kind, slug)
);

CREATE INDEX revival_tags_lookup_idx ON revival_tags (kind, slug);
CREATE INDEX revival_tags_work_idx ON revival_tags (work_id);

CREATE TABLE catalogue_gap_lookups (
  query_key TEXT PRIMARY KEY,
  looked_up_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalogue_gap_lookups_recent_idx ON catalogue_gap_lookups (looked_up_at);

CREATE TABLE catalogue_gap_titles (
  imdb_id TEXT PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalogue_gap_titles_recent_idx ON catalogue_gap_titles (queued_at);

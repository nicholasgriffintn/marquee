CREATE TABLE catalog_seasons (
  title_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  overview TEXT NOT NULL DEFAULT '',
  air_date DATE,
  episode_count INTEGER NOT NULL DEFAULT 0,
  poster_url TEXT,
  payload TEXT NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  episodes_fetched_at TIMESTAMPTZ,
  PRIMARY KEY (title_id, season_number)
);

CREATE INDEX catalog_seasons_fetched_idx ON catalog_seasons (fetched_at);

CREATE TABLE title_enrichment (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  miss SMALLINT NOT NULL DEFAULT 0 CHECK (miss IN (0, 1)),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_check_at TIMESTAMPTZ,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_enrichment_miss_idx ON title_enrichment (source, miss, fetched_at);
CREATE INDEX title_enrichment_next_check_idx ON title_enrichment (source, next_check_at);
CREATE INDEX title_enrichment_source_idx ON title_enrichment (source, fetched_at);
CREATE INDEX title_enrichment_source_title_idx ON title_enrichment (source, title_id);

CREATE TABLE title_embeddings (
  title_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX title_embeddings_model_idx ON title_embeddings (model, content_hash);
CREATE INDEX title_embeddings_retry_idx ON title_embeddings (next_attempt_at);

CREATE TABLE title_insights (
  title_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE title_provider_state (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_kind TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1 CHECK (seen_count >= 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  announced_at TIMESTAMPTZ,
  PRIMARY KEY (title_id, provider_id)
);

CREATE INDEX title_provider_state_last_seen_idx ON title_provider_state (announced_at, last_seen_at);
CREATE INDEX title_provider_state_new_idx ON title_provider_state (announced_at, seen_count);
CREATE INDEX title_provider_state_provider_kind_seen_idx ON title_provider_state (provider_id, offer_kind, first_seen_at);

CREATE TABLE provider_snapshots (
  region TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE title_schedule (
  id TEXT PRIMARY KEY,
  title_id TEXT,
  imdb_id TEXT,
  show_name TEXT NOT NULL,
  season INTEGER,
  episode INTEGER,
  episode_name TEXT,
  airs_at TIMESTAMPTZ NOT NULL,
  network TEXT,
  source TEXT NOT NULL DEFAULT 'tvmaze',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX title_schedule_airs_idx ON title_schedule (airs_at);
CREATE INDEX title_schedule_title_idx ON title_schedule (title_id);

CREATE TABLE title_buzz (
  title_id TEXT PRIMARY KEY,
  article TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  previous_views INTEGER NOT NULL DEFAULT 0,
  delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'search',
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  world_views INTEGER NOT NULL DEFAULT 0,
  world_previous_views INTEGER NOT NULL DEFAULT 0,
  world_score DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE INDEX title_buzz_delta_idx ON title_buzz (delta DESC);
CREATE INDEX title_buzz_measured_idx ON title_buzz (measured_at);
CREATE INDEX title_buzz_score_idx ON title_buzz (score DESC);
CREATE INDEX title_buzz_views_idx ON title_buzz (views DESC);
CREATE INDEX title_buzz_world_score_idx ON title_buzz (world_score DESC);

CREATE TABLE title_working_set (
  title_id TEXT PRIMARY KEY,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  demand INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX title_working_set_demand_idx ON title_working_set (demand);
CREATE INDEX title_working_set_refreshed_idx ON title_working_set (refreshed_at);

CREATE TABLE awards (
  award_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  wikidata_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX awards_wikidata_idx ON awards (wikidata_id) WHERE wikidata_id IS NOT NULL;

CREATE TABLE title_awards (
  title_id TEXT NOT NULL,
  award_id TEXT NOT NULL REFERENCES awards(award_id),
  ceremony_year INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'nominated')),
  source TEXT NOT NULL DEFAULT 'wikidata',
  PRIMARY KEY (title_id, award_id, ceremony_year, outcome, source)
);

CREATE INDEX title_awards_award_idx ON title_awards (award_id, outcome);
CREATE INDEX title_awards_source_idx ON title_awards (source, title_id);

CREATE TABLE person_awards (
  person_id INTEGER NOT NULL,
  award_id TEXT NOT NULL REFERENCES awards(award_id),
  ceremony_year INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'nominated')),
  source TEXT NOT NULL DEFAULT 'wikidata',
  PRIMARY KEY (person_id, award_id, ceremony_year, outcome, source)
);

CREATE INDEX person_awards_award_idx ON person_awards (award_id, outcome);
CREATE INDEX person_awards_source_idx ON person_awards (source, person_id);

CREATE TABLE title_award_sync (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  statements INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_award_sync_due_idx ON title_award_sync (source, synced_at);

CREATE TABLE person_award_sync (
  person_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  statements INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, source)
);

CREATE INDEX person_award_sync_due_idx ON person_award_sync (source, synced_at);

CREATE TABLE catalog_places (
  entity_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  precision_degrees DOUBLE PRECISION NOT NULL DEFAULT 1,
  country_id TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalog_places_country_idx ON catalog_places (country_id, entity_id);

CREATE TABLE catalog_title_places (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('filming', 'narrative')),
  place_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'wikidata' CHECK (btrim(source) <> ''),
  PRIMARY KEY (title_id, kind, place_id, source)
);

CREATE INDEX catalog_title_places_place_idx ON catalog_title_places (place_id, title_id);

CREATE TABLE catalog_title_place_sync (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (btrim(source) <> ''),
  places INTEGER NOT NULL DEFAULT 0 CHECK (places >= 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX catalog_title_place_sync_stale_idx ON catalog_title_place_sync (source, places, synced_at);

CREATE TABLE title_identifier_syncs (
  title_id TEXT PRIMARY KEY,
  matched SMALLINT NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_works (
  work_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  work_type TEXT,
  published_year INTEGER,
  wikidata_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX source_works_wikidata_idx ON source_works (wikidata_id) WHERE wikidata_id IS NOT NULL;

CREATE TABLE source_work_authors (
  work_id TEXT NOT NULL REFERENCES source_works(work_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  wikidata_id TEXT,
  PRIMARY KEY (work_id, name)
);

CREATE TABLE title_source_works (
  title_id TEXT NOT NULL,
  work_id TEXT NOT NULL REFERENCES source_works(work_id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'wikidata',
  PRIMARY KEY (title_id, work_id, source)
);

CREATE INDEX title_source_works_work_idx ON title_source_works (work_id);

CREATE TABLE title_adaptation_scans (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL,
  works INTEGER NOT NULL DEFAULT 0,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_adaptation_scans_due_idx ON title_adaptation_scans (source, scanned_at);

CREATE TABLE title_language_buzz (
  title_id TEXT NOT NULL,
  language TEXT NOT NULL,
  article TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  previous_views INTEGER NOT NULL DEFAULT 0,
  share DOUBLE PRECISION NOT NULL DEFAULT 0,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, language)
);

CREATE INDEX title_language_buzz_share_idx ON title_language_buzz (title_id, share DESC);

CREATE TABLE wikipedia_project_volume (
  language TEXT PRIMARY KEY,
  views INTEGER NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE title_visual_format (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('colour', 'aspect_ratio')),
  value TEXT NOT NULL CHECK (btrim(value) <> ''),
  source TEXT NOT NULL DEFAULT 'wikidata' CHECK (btrim(source) <> ''),
  PRIMARY KEY (title_id, kind, value, source),
  CHECK (
    (kind = 'colour' AND value IN ('colour', 'black and white', 'sepia'))
    OR (kind = 'aspect_ratio' AND value ~ '^[0-9]\.[0-9]{2}:1$')
  )
);

CREATE INDEX title_visual_format_lookup_idx ON title_visual_format (kind, value, title_id);

CREATE TABLE title_visual_format_sync (
  title_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (btrim(source) <> ''),
  values_found INTEGER NOT NULL DEFAULT 0 CHECK (values_found >= 0),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_visual_format_sync_due_idx ON title_visual_format_sync (source, checked_at);

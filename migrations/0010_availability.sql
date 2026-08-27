CREATE TABLE title_provider_state (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_kind TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  announced_at TEXT,
  PRIMARY KEY (title_id, provider_id)
);

CREATE INDEX title_provider_state_last_seen_idx
  ON title_provider_state (announced_at, last_seen_at);

CREATE INDEX title_provider_state_new_idx
  ON title_provider_state (announced_at, seen_count);

CREATE INDEX title_provider_state_provider_kind_seen_idx
  ON title_provider_state (provider_id, offer_kind, first_seen_at);

CREATE TABLE provider_snapshots (
  region TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

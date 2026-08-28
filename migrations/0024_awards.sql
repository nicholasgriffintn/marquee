CREATE TABLE awards (
  award_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE title_awards (
  title_id TEXT NOT NULL,
  award_id TEXT NOT NULL REFERENCES awards(award_id),
  ceremony_year INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'nominated')),
  PRIMARY KEY (title_id, award_id, ceremony_year, outcome)
);

CREATE INDEX title_awards_award_idx ON title_awards (award_id, outcome);

CREATE TABLE person_awards (
  person_id INTEGER NOT NULL,
  award_id TEXT NOT NULL REFERENCES awards(award_id),
  ceremony_year INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'nominated')),
  PRIMARY KEY (person_id, award_id, ceremony_year, outcome)
);

CREATE INDEX person_awards_award_idx ON person_awards (award_id, outcome);

CREATE TABLE title_award_sync (
  title_id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  statements INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX title_award_sync_synced_idx ON title_award_sync (synced_at);

CREATE TABLE person_award_sync (
  person_id INTEGER PRIMARY KEY,
  statements INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX person_award_sync_synced_idx ON person_award_sync (synced_at);

CREATE INDEX catalog_people_popularity_idx ON catalog_people (popularity DESC);

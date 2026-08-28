CREATE TABLE awards (
  award_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  wikidata_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id, source)
);

CREATE INDEX title_award_sync_due_idx ON title_award_sync (source, synced_at);

CREATE TABLE person_award_sync (
  person_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  statements INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, source)
);

CREATE INDEX person_award_sync_due_idx ON person_award_sync (source, synced_at);

CREATE INDEX catalog_people_popularity_idx ON catalog_people (popularity DESC);

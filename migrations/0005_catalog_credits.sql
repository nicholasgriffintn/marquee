CREATE TABLE catalog_credits (
  credit_id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  person_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  job TEXT,
  character TEXT,
  billing INTEGER
, season_number INTEGER, episode_number INTEGER, episode_count INTEGER);

CREATE INDEX catalog_credits_episode_idx
  ON catalog_credits (title_id, season_number, episode_number);

CREATE INDEX catalog_credits_job_idx ON catalog_credits (job);

CREATE INDEX catalog_credits_person_idx ON catalog_credits (person_id);

CREATE INDEX catalog_credits_title_idx
  ON catalog_credits (title_id, season_number, episode_number, department, billing);

CREATE TABLE catalog_people (
  person_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  original_name TEXT,
  known_for TEXT,
  gender INTEGER,
  profile_path TEXT,
  popularity REAL,
  titles INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX catalog_people_lower_name_idx ON catalog_people (lower(name));

CREATE INDEX catalog_people_name_idx ON catalog_people (name, titles DESC);

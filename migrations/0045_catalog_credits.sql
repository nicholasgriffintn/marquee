DROP TABLE IF EXISTS catalog_person_titles;

DROP TABLE IF EXISTS catalog_people;

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

CREATE INDEX IF NOT EXISTS catalog_people_name_idx ON catalog_people (name, titles DESC);

CREATE TABLE catalog_credits (
  credit_id TEXT PRIMARY KEY,
  title_id TEXT NOT NULL,
  person_id INTEGER NOT NULL,
  department TEXT NOT NULL,
  job TEXT,
  character TEXT,
  billing INTEGER
);

CREATE INDEX IF NOT EXISTS catalog_credits_title_idx
  ON catalog_credits (title_id, department, billing);

CREATE INDEX IF NOT EXISTS catalog_credits_person_idx ON catalog_credits (person_id);

CREATE INDEX IF NOT EXISTS catalog_credits_job_idx ON catalog_credits (job);

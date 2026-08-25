DROP TABLE IF EXISTS catalog_person_titles;

DROP TABLE IF EXISTS catalog_people;

CREATE TABLE catalog_people (
  person_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  titles INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS catalog_people_name_idx ON catalog_people (name, titles DESC);

CREATE TABLE catalog_person_titles (
  person_id INTEGER NOT NULL,
  title_id TEXT NOT NULL,
  PRIMARY KEY (person_id, title_id)
);

CREATE INDEX IF NOT EXISTS catalog_person_titles_title_idx ON catalog_person_titles (title_id);

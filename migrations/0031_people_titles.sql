CREATE TABLE IF NOT EXISTS catalog_person_titles (
  person TEXT NOT NULL,
  title_id TEXT NOT NULL,
  PRIMARY KEY (person, title_id)
);

CREATE INDEX IF NOT EXISTS catalog_person_titles_title_idx
  ON catalog_person_titles (title_id);

CREATE INDEX IF NOT EXISTS catalog_titles_collection_idx
  ON catalog_titles (json_extract(payload, '$.collection.id'));

CREATE INDEX IF NOT EXISTS catalog_people_lower_name_idx ON catalog_people (lower(name));

CREATE INDEX IF NOT EXISTS viewing_entries_title_idx ON viewing_entries (title_id);

CREATE INDEX IF NOT EXISTS catalog_titles_type_popularity_idx ON catalog_titles (media_type, popularity DESC);

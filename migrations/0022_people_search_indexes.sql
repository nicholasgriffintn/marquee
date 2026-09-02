CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX catalog_people_name_trgm_idx ON catalog_people USING GIN (lower(name) gin_trgm_ops);

CREATE INDEX catalog_people_titles_idx ON catalog_people (titles DESC) WHERE titles > 0;

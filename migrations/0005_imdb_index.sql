ALTER TABLE catalog_titles ADD COLUMN imdb_id TEXT;

CREATE INDEX IF NOT EXISTS catalog_titles_imdb_idx
  ON catalog_titles (imdb_id);

UPDATE catalog_titles
SET imdb_id = replace(
  replace(json_extract(payload, '$.imdbUrl'), 'https://www.imdb.com/title/', ''),
  '/',
  ''
)
WHERE json_extract(payload, '$.imdbUrl') IS NOT NULL;

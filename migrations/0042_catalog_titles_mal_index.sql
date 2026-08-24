CREATE INDEX IF NOT EXISTS catalog_titles_mal_idx
  ON catalog_titles (json_extract(payload, '$.externalIds.malId'));

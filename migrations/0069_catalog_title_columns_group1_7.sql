UPDATE catalog_titles SET
overview = COALESCE(json_extract(payload, '$.overview'), ''),
  release_date = json_extract(payload, '$.releaseDate'),
  runtime_minutes = json_extract(payload, '$.runtimeMinutes'),
  number_of_seasons = json_extract(payload, '$.numberOfSeasons'),
  certification = json_extract(payload, '$.certification'),
  status = json_extract(payload, '$.status')
WHERE (rowid % 8) = 7;

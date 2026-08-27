UPDATE catalog_titles SET
original_language = json_extract(payload, '$.originalLanguage'),
  tmdb_score = json_extract(payload, '$.tmdbScore'),
  poster_url = json_extract(payload, '$.posterUrl'),
  backdrop_url = json_extract(payload, '$.backdropUrl'),
  watch_link = json_extract(payload, '$.watchLink'),
  revenue = json_extract(payload, '$.revenue')
WHERE (rowid % 8) = 5;

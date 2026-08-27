INSERT OR IGNORE INTO catalog_title_details
  (title_id, homepage, trailer_key, tagline, budget, episode_count, last_air_date, next_air_date, pending)
SELECT id,
  json_extract(payload, '$.homepage'),
  json_extract(payload, '$.trailerKey'),
  json_extract(payload, '$.tagline'),
  json_extract(payload, '$.budget'),
  json_extract(payload, '$.episodeCount'),
  json_extract(payload, '$.lastAirDate'),
  json_extract(payload, '$.nextAirDate'),
  json_extract(payload, '$.pending')
FROM catalog_titles
WHERE (rowid % 2) = 1
  AND COALESCE(
    json_extract(payload, '$.homepage'),
    json_extract(payload, '$.trailerKey'),
    json_extract(payload, '$.tagline'),
    json_extract(payload, '$.budget'),
    json_extract(payload, '$.episodeCount'),
    json_extract(payload, '$.lastAirDate'),
    json_extract(payload, '$.nextAirDate'),
    json_extract(payload, '$.pending')
  ) IS NOT NULL;

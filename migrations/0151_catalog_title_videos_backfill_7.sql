INSERT OR IGNORE INTO catalog_title_videos (title_id, video_key, name, type, position)
SELECT catalog_titles.id,
  json_extract(v.value, '$.key'),
  json_extract(v.value, '$.name'),
  json_extract(v.value, '$.type'),
  v.key
FROM catalog_titles, json_each(payload, '$.videos') AS v
WHERE json_extract(v.value, '$.key') IS NOT NULL AND (catalog_titles.rowid % 8) = 7;

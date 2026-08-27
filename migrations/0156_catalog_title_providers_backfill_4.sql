INSERT OR IGNORE INTO catalog_title_providers (title_id, provider_id, name, web_url, source, position)
SELECT catalog_titles.id,
  json_extract(p.value, '$.id'),
  json_extract(p.value, '$.name'),
  json_extract(p.value, '$.webUrl'),
  json_extract(p.value, '$.source'),
  p.key
FROM catalog_titles, json_each(payload, '$.providers') AS p
WHERE json_extract(p.value, '$.id') IS NOT NULL AND (catalog_titles.rowid % 8) = 4;

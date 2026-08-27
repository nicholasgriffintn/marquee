INSERT OR IGNORE INTO catalog_title_countries (title_id, kind, country, position)
SELECT catalog_titles.id, 'general', c.value, c.key
FROM catalog_titles, json_each(payload, '$.countries') AS c
WHERE c.value IS NOT NULL AND c.value <> '' AND (catalog_titles.rowid % 8) = 2
UNION ALL
SELECT catalog_titles.id, 'origin', c.value, c.key
FROM catalog_titles, json_each(payload, '$.originCountries') AS c
WHERE c.value IS NOT NULL AND c.value <> '' AND (catalog_titles.rowid % 8) = 2
UNION ALL
SELECT catalog_titles.id, 'production', c.value, c.key
FROM catalog_titles, json_each(payload, '$.productionCountries') AS c
WHERE c.value IS NOT NULL AND c.value <> '' AND (catalog_titles.rowid % 8) = 2;

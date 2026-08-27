INSERT OR IGNORE INTO catalog_title_studios (title_id, studio, position)
SELECT catalog_titles.id, s.value, s.key
FROM catalog_titles, json_each(payload, '$.studios') AS s
WHERE s.value IS NOT NULL AND s.value <> '' AND (catalog_titles.rowid % 8) = 3;

INSERT OR IGNORE INTO catalog_title_people (title_id, person, position)
SELECT catalog_titles.id, p.value, p.key
FROM catalog_titles, json_each(payload, '$.people') AS p
WHERE p.value IS NOT NULL AND p.value <> '' AND (catalog_titles.rowid % 8) = 4;

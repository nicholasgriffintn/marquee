INSERT OR IGNORE INTO catalog_title_genres (title_id, genre, position)
SELECT catalog_titles.id, g.value, g.key
FROM catalog_titles, json_each(payload, '$.genres') AS g
WHERE g.value IS NOT NULL AND g.value <> '';

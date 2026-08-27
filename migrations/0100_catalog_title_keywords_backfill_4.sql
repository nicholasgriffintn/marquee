INSERT OR IGNORE INTO catalog_title_keywords (title_id, keyword, position)
SELECT catalog_titles.id, k.value, k.key
FROM catalog_titles, json_each(payload, '$.keywords') AS k
WHERE k.value IS NOT NULL AND k.value <> '' AND (catalog_titles.rowid % 8) = 4;

INSERT OR IGNORE INTO catalog_title_languages (title_id, kind, language, position)
SELECT catalog_titles.id, 'general', l.value, l.key
FROM catalog_titles, json_each(payload, '$.languages') AS l
WHERE l.value IS NOT NULL AND l.value <> '' AND (catalog_titles.rowid % 8) = 6
UNION ALL
SELECT catalog_titles.id, 'spoken', l.value, l.key
FROM catalog_titles, json_each(payload, '$.spokenLanguages') AS l
WHERE l.value IS NOT NULL AND l.value <> '' AND (catalog_titles.rowid % 8) = 6;

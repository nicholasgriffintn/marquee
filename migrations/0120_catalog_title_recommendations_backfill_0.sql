INSERT OR IGNORE INTO catalog_title_recommendation_ids (title_id, recommended_id, position)
SELECT catalog_titles.id, r.value, r.key
FROM catalog_titles, json_each(payload, '$.recommendationIds') AS r
WHERE r.value IS NOT NULL AND r.value <> '' AND (catalog_titles.rowid % 8) = 0;

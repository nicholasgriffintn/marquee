INSERT OR IGNORE INTO catalog_title_provider_offers (title_id, provider_id, offer_type, position)
SELECT catalog_titles.id, json_extract(p.value, '$.id'), o.value, o.key
FROM catalog_titles, json_each(payload, '$.providers') AS p,
     json_each(json_extract(p.value, '$.offerTypes')) AS o
WHERE json_extract(p.value, '$.id') IS NOT NULL AND o.value IS NOT NULL AND o.value <> '';

UPDATE catalog_titles SET
collection_id = json_extract(payload, '$.collection.id'),
  collection_name = json_extract(payload, '$.collection.name'),
  mal_id = json_extract(payload, '$.externalIds.malId'),
  anilist_id = json_extract(payload, '$.externalIds.anilistId'),
  wikidata_id = json_extract(payload, '$.externalIds.wikidataId')
WHERE (rowid % 8) = 7;

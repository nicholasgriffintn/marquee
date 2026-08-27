UPDATE catalog_search SET
  overview = COALESCE(
    (SELECT overview FROM catalog_titles WHERE catalog_titles.id = catalog_search.title_id), ''
  ),
  tags = COALESCE(
    (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = catalog_search.title_id), ''
  ) || ' ' || COALESCE(
    (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = catalog_search.title_id), ''
  ),
  people = COALESCE(
    (SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = catalog_search.title_id), ''
  )
WHERE (rowid % 8) = 4;

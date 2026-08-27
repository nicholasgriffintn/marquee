DROP TRIGGER IF EXISTS catalog_titles_search_insert;
DROP TRIGGER IF EXISTS catalog_titles_search_update;

CREATE TRIGGER catalog_titles_search_insert
AFTER INSERT ON catalog_titles
BEGIN
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid,
    new.title,
    new.original_title,
    new.overview,
    COALESCE(
      (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), ''
    ) || ' ' || COALESCE(
      (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''
    ),
    COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = new.id), ''),
    new.id
  );
END;

CREATE TRIGGER catalog_titles_search_update
AFTER UPDATE ON catalog_titles
BEGIN
  DELETE FROM catalog_search WHERE rowid = old.rowid;
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid,
    new.title,
    new.original_title,
    new.overview,
    COALESCE(
      (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), ''
    ) || ' ' || COALESCE(
      (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''
    ),
    COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = new.id), ''),
    new.id
  );
END;

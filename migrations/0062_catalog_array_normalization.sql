CREATE TABLE IF NOT EXISTS catalog_title_genres (
  title_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, genre)
);

CREATE INDEX IF NOT EXISTS catalog_title_genres_genre_idx
  ON catalog_title_genres (genre, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_keywords (
  title_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, keyword)
);

CREATE INDEX IF NOT EXISTS catalog_title_keywords_keyword_idx
  ON catalog_title_keywords (keyword, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_studios (
  title_id TEXT NOT NULL,
  studio TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, studio)
);

CREATE INDEX IF NOT EXISTS catalog_title_studios_studio_idx
  ON catalog_title_studios (studio, title_id);

INSERT INTO catalog_title_genres (title_id, genre, position)
SELECT catalog_titles.id, json_each.value, json_each.key
FROM catalog_titles, json_each(payload, '$.genres')
WHERE json_each.value IS NOT NULL AND json_each.value <> '';

INSERT INTO catalog_title_keywords (title_id, keyword, position)
SELECT catalog_titles.id, json_each.value, json_each.key
FROM catalog_titles, json_each(payload, '$.keywords')
WHERE json_each.value IS NOT NULL AND json_each.value <> '';

INSERT INTO catalog_title_studios (title_id, studio, position)
SELECT catalog_titles.id, json_each.value, json_each.key
FROM catalog_titles, json_each(payload, '$.studios')
WHERE json_each.value IS NOT NULL AND json_each.value <> '';

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
    COALESCE(json_extract(new.payload, '$.overview'), ''),
    COALESCE(
      (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), ''
    ) || ' ' || COALESCE(
      (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''
    ),
    COALESCE(json_extract(new.payload, '$.people'), ''),
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
    COALESCE(json_extract(new.payload, '$.overview'), ''),
    COALESCE(
      (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), ''
    ) || ' ' || COALESCE(
      (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''
    ),
    COALESCE(json_extract(new.payload, '$.people'), ''),
    new.id
  );
END;

UPDATE catalog_search SET tags =
  COALESCE(
    (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = catalog_search.title_id), ''
  ) || ' ' || COALESCE(
    (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = catalog_search.title_id), ''
  );

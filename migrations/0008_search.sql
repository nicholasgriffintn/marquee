CREATE VIRTUAL TABLE IF NOT EXISTS catalog_search USING fts5(
  title,
  original_title,
  overview,
  tags,
  people,
  title_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
SELECT
  rowid,
  title,
  original_title,
  COALESCE(json_extract(payload, '$.overview'), ''),
  COALESCE(json_extract(payload, '$.genres'), '') || ' ' || COALESCE(json_extract(payload, '$.keywords'), ''),
  COALESCE(json_extract(payload, '$.people'), ''),
  id
FROM catalog_titles;

CREATE TRIGGER IF NOT EXISTS catalog_titles_search_insert
AFTER INSERT ON catalog_titles
BEGIN
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid,
    new.title,
    new.original_title,
    COALESCE(json_extract(new.payload, '$.overview'), ''),
    COALESCE(json_extract(new.payload, '$.genres'), '') || ' ' || COALESCE(json_extract(new.payload, '$.keywords'), ''),
    COALESCE(json_extract(new.payload, '$.people'), ''),
    new.id
  );
END;

CREATE TRIGGER IF NOT EXISTS catalog_titles_search_delete
AFTER DELETE ON catalog_titles
BEGIN
  DELETE FROM catalog_search WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS catalog_titles_search_update
AFTER UPDATE ON catalog_titles
BEGIN
  DELETE FROM catalog_search WHERE rowid = old.rowid;
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid,
    new.title,
    new.original_title,
    COALESCE(json_extract(new.payload, '$.overview'), ''),
    COALESCE(json_extract(new.payload, '$.genres'), '') || ' ' || COALESCE(json_extract(new.payload, '$.keywords'), ''),
    COALESCE(json_extract(new.payload, '$.people'), ''),
    new.id
  );
END;

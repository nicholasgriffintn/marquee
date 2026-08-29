CREATE TABLE catalog_search (
  title_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  overview TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  people TEXT NOT NULL DEFAULT '',
  title_document TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', title), 'A')
    || setweight(to_tsvector('simple', original_title), 'A')
  ) STORED,
  document TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', title), 'A')
    || setweight(to_tsvector('simple', original_title), 'A')
    || setweight(to_tsvector('simple', people), 'B')
    || setweight(to_tsvector('simple', tags), 'C')
    || setweight(to_tsvector('simple', overview), 'D')
  ) STORED
);

CREATE INDEX catalog_search_title_document_idx ON catalog_search USING GIN (title_document);
CREATE INDEX catalog_search_document_idx ON catalog_search USING GIN (document);

CREATE TABLE catalog_index_pending (
  title_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalog_index_pending_queued_idx ON catalog_index_pending (queued_at);

CREATE FUNCTION queue_catalog_title_index() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.catalog_index_pending (title_id, reason)
  VALUES (NEW.id, 'title')
  ON CONFLICT (title_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_titles_index_insert
AFTER INSERT ON catalog_titles
FOR EACH ROW
EXECUTE FUNCTION queue_catalog_title_index();

CREATE TRIGGER catalog_titles_index_update
AFTER UPDATE OF title, original_title, overview ON catalog_titles
FOR EACH ROW
WHEN (
  OLD.title IS DISTINCT FROM NEW.title
  OR OLD.original_title IS DISTINCT FROM NEW.original_title
  OR OLD.overview IS DISTINCT FROM NEW.overview
)
EXECUTE FUNCTION queue_catalog_title_index();

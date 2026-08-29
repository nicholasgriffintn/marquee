CREATE TABLE catalog_index_pending (
  title_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX catalog_index_pending_queued_idx
  ON catalog_index_pending (queued_at);

DROP TRIGGER catalog_titles_search_insert;

DROP TRIGGER catalog_titles_search_update;

CREATE TRIGGER catalog_titles_index_insert
AFTER INSERT ON catalog_titles
BEGIN
  INSERT INTO catalog_index_pending (title_id, reason)
  VALUES (new.id, 'title')
  ON CONFLICT(title_id) DO NOTHING;
END;

CREATE TRIGGER catalog_titles_index_update
AFTER UPDATE OF title, original_title, overview ON catalog_titles
WHEN old.title IS NOT new.title
  OR old.original_title IS NOT new.original_title
  OR old.overview IS NOT new.overview
BEGIN
  INSERT INTO catalog_index_pending (title_id, reason)
  VALUES (new.id, 'title')
  ON CONFLICT(title_id) DO NOTHING;
END;

ALTER TABLE title_embeddings ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE title_embeddings ADD COLUMN next_attempt_at TEXT;

ALTER TABLE title_embeddings ADD COLUMN error TEXT;

CREATE INDEX title_embeddings_model_idx
  ON title_embeddings (model, content_hash);

CREATE INDEX title_embeddings_retry_idx
  ON title_embeddings (next_attempt_at);

INSERT INTO catalog_index_pending (title_id, reason)
SELECT id, 'rebuild' FROM catalog_titles
WHERE true
ON CONFLICT(title_id) DO NOTHING;

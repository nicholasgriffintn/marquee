-- title_embeddings has one row per title_id (PRIMARY KEY (title_id)), and only one
-- embedding model is ever used, so `model` is non-selective. The planner was choosing
-- title_embeddings_model_idx for `WHERE model = ? AND title_id IN (...)` lookups instead
-- of the primary key, reading most of the table per batch.
DROP INDEX IF EXISTS title_embeddings_model_idx;

CREATE TABLE IF NOT EXISTS title_embeddings (
  title_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  embedded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS title_embeddings_model_idx
  ON title_embeddings (model, embedded_at);

CREATE TABLE viewer_ai_models (
  viewer_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  credential_source TEXT NOT NULL DEFAULT 'cloudflare'
    CHECK (credential_source IN ('cloudflare', 'byok')),
  byok_alias TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (char_length(provider) BETWEEN 1 AND 40),
  CHECK (char_length(model) BETWEEN 1 AND 160),
  CHECK (provider ~ '^[a-z0-9][a-z0-9-]*$'),
  CHECK (model ~ '^[A-Za-z0-9@][A-Za-z0-9@._:/-]*$'),
  CHECK (
    (credential_source = 'cloudflare' AND byok_alias IS NULL)
    OR
    (
      credential_source = 'byok'
      AND byok_alias IS NOT NULL
      AND char_length(byok_alias) BETWEEN 1 AND 64
      AND byok_alias ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
    )
  )
);

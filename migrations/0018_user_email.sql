ALTER TABLE users ADD COLUMN email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx
  ON users (email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_challenges (
  token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_challenges_expiry_idx ON auth_challenges (expires_at);

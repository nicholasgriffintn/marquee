ALTER TABLE users ADD COLUMN alert_email TEXT;
ALTER TABLE users ADD COLUMN alert_email_verified_at TEXT;

CREATE TABLE IF NOT EXISTS alert_email_tokens (
  token_hash TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS alert_email_tokens_viewer_idx
  ON alert_email_tokens (viewer_id);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  github_login TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, role TEXT NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('viewer', 'admin')), email TEXT, alert_email TEXT, alert_email_verified_at TEXT);

CREATE UNIQUE INDEX users_email_idx
  ON users (email) WHERE email IS NOT NULL;

CREATE INDEX users_role_idx ON users (role);

CREATE TABLE identities (
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claims_json TEXT NOT NULL,
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX identities_user_idx ON identities (user_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE INDEX api_tokens_user_idx ON api_tokens (user_id);

CREATE TABLE auth_challenges (
  token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX auth_challenges_expiry_idx ON auth_challenges (expires_at);

CREATE TABLE native_auth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX native_auth_codes_expiry_idx ON native_auth_codes (expires_at);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  nonce TEXT,
  redirect_uri TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at);

CREATE TABLE "linked_accounts" (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  account_label TEXT,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT, pushed_at TEXT, broken_at TEXT,
  PRIMARY KEY (viewer_id, provider)
);

CREATE TABLE alert_email_tokens (
  token_hash TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX alert_email_tokens_viewer_idx
  ON alert_email_tokens (viewer_id);

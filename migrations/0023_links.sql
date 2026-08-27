CREATE TABLE link_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  return_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX link_states_expiry_idx ON link_states (expires_at);

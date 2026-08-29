CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  viewer_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  fallback_from TEXT NOT NULL DEFAULT '[]',
  candidates TEXT NOT NULL DEFAULT '[]',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  selected TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  outcome TEXT NOT NULL DEFAULT 'served'
    CHECK (outcome IN ('served', 'empty', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX decisions_expiry_idx
  ON decisions (expires_at);

CREATE INDEX decisions_feature_idx
  ON decisions (feature, created_at DESC);

CREATE INDEX decisions_viewer_idx
  ON decisions (viewer_id, created_at DESC);

ALTER TABLE viewer_signals ADD COLUMN decision_id TEXT;

CREATE INDEX viewer_signals_decision_idx
  ON viewer_signals (decision_id);

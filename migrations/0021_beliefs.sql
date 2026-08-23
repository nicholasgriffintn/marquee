CREATE TABLE IF NOT EXISTS viewer_beliefs (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 1,
  confidence REAL NOT NULL DEFAULT 0.5,
  scope TEXT NOT NULL DEFAULT 'always'
    CHECK (scope IN ('always', 'tonight', 'week')),
  source_rule TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  suspended_until TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS viewer_beliefs_key_idx
  ON viewer_beliefs (viewer_id, key);

CREATE INDEX IF NOT EXISTS viewer_beliefs_active_idx
  ON viewer_beliefs (viewer_id, revoked_at);

CREATE TABLE IF NOT EXISTS belief_evidence (
  belief_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  noted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (belief_id, evidence_kind, evidence_id)
);

CREATE INDEX IF NOT EXISTS belief_evidence_belief_idx
  ON belief_evidence (belief_id);

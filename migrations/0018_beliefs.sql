CREATE TABLE "viewer_beliefs" (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE INDEX viewer_beliefs_active_idx
  ON viewer_beliefs (viewer_id, revoked_at);

CREATE UNIQUE INDEX viewer_beliefs_key_idx
  ON viewer_beliefs (viewer_id, key);

CREATE TABLE belief_evidence (
  belief_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  noted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (belief_id, evidence_kind, evidence_id)
);

CREATE INDEX belief_evidence_belief_idx
  ON belief_evidence (belief_id);

CREATE TABLE angle_scores (
  angle TEXT PRIMARY KEY,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  exits INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, watched INTEGER NOT NULL DEFAULT 0);

CREATE TABLE "viewer_answers" (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, question_id)
);

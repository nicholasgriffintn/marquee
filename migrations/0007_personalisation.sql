CREATE TABLE viewer_beliefs (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 1,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  scope TEXT NOT NULL DEFAULT 'always' CHECK (scope IN ('always', 'tonight', 'week')),
  source_rule TEXT NOT NULL,
  edited SMALLINT NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
  suspended_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trait TEXT,
  polarity TEXT CHECK (polarity IS NULL OR polarity IN ('seeks', 'avoids'))
);

CREATE INDEX viewer_beliefs_active_idx ON viewer_beliefs (viewer_id, revoked_at);
CREATE UNIQUE INDEX viewer_beliefs_key_idx ON viewer_beliefs (viewer_id, key);

CREATE TABLE belief_evidence (
  belief_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  noted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (belief_id, evidence_kind, evidence_id)
);

CREATE TABLE angle_scores (
  angle TEXT PRIMARY KEY,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  exits INTEGER NOT NULL DEFAULT 0,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  watched INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  attrition DOUBLE PRECISION NOT NULL DEFAULT 0,
  dwell_ms DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE viewer_answers (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, question_id)
);

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
  cost_usd DOUBLE PRECISION,
  outcome TEXT NOT NULL DEFAULT 'served' CHECK (outcome IN ('served', 'empty', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX decisions_expiry_idx ON decisions (expires_at);
CREATE INDEX decisions_feature_idx ON decisions (feature, created_at DESC);
CREATE INDEX decisions_viewer_idx ON decisions (viewer_id, created_at DESC);

CREATE TABLE viewer_signals (
  id TEXT PRIMARY KEY,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_id TEXT,
  journey_id TEXT,
  context TEXT NOT NULL DEFAULT '{}',
  weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  decision_id TEXT
);

CREATE INDEX viewer_signals_decision_idx ON viewer_signals (decision_id);
CREATE INDEX viewer_signals_expiry_idx ON viewer_signals (expires_at);
CREATE INDEX viewer_signals_journey_idx ON viewer_signals (journey_id);
CREATE INDEX viewer_signals_lookup_idx ON viewer_signals (viewer_id, type, created_at DESC);

CREATE TABLE viewer_usher (
  viewer_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-progress', 'done', 'dismissed')),
  asked TEXT NOT NULL DEFAULT '[]',
  muted TEXT NOT NULL DEFAULT '{}',
  ignored SMALLINT NOT NULL DEFAULT 0 CHECK (ignored IN (0, 1)),
  snoozed_until TIMESTAMPTZ,
  last_prompted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE ai_rails (
  viewer_id TEXT PRIMARY KEY,
  revision TEXT NOT NULL DEFAULT '',
  generation_id TEXT NOT NULL DEFAULT '',
  attempted_revision TEXT,
  attempted_at TIMESTAMPTZ,
  claim_revision TEXT,
  claimed_at TIMESTAMPTZ,
  payload TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rail_feedback (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rail_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('good', 'bad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, rail_id)
);

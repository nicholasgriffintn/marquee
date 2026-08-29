CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  subject_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE INDEX ingestion_runs_started_idx ON ingestion_runs (started_at DESC);
CREATE INDEX ingestion_runs_status_idx ON ingestion_runs (status, started_at);

CREATE TABLE source_budgets (
  source TEXT PRIMARY KEY,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('day', 'month')),
  call_limit INTEGER NOT NULL CHECK (call_limit >= 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paused_until TIMESTAMPTZ,
  consecutive_pauses INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_pauses >= 0)
);

CREATE TABLE external_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  dataset TEXT NOT NULL,
  version TEXT NOT NULL,
  entries INTEGER NOT NULL DEFAULT 0 CHECK (entries >= 0),
  mapped INTEGER NOT NULL DEFAULT 0 CHECK (mapped >= 0),
  written INTEGER NOT NULL DEFAULT 0 CHECK (written >= 0),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'rejected', 'failed')),
  detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_external_imports_recent ON external_imports (source, dataset, status, started_at DESC);

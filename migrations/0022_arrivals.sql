CREATE TABLE IF NOT EXISTS title_provider_state (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_kind TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  announced_at TEXT,
  PRIMARY KEY (title_id, provider_id)
);

CREATE INDEX IF NOT EXISTS title_provider_state_new_idx
  ON title_provider_state (announced_at, seen_count);

CREATE TABLE IF NOT EXISTS viewer_alerts (
  viewer_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, title_id, kind)
);

CREATE INDEX IF NOT EXISTS viewer_alerts_recent_idx
  ON viewer_alerts (viewer_id, sent_at DESC);

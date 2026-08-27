CREATE TABLE "viewer_alerts" (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  title_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind, alert_key)
);

CREATE INDEX viewer_alerts_recent_idx
  ON viewer_alerts (viewer_id, sent_at DESC);

CREATE TABLE "viewer_alert_settings" (
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'email',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind)
);

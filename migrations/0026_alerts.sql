DROP TABLE IF EXISTS viewer_alerts;

CREATE TABLE IF NOT EXISTS viewer_alerts (
  viewer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  title_id TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  detail TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind, alert_key)
);

CREATE INDEX IF NOT EXISTS viewer_alerts_recent_idx
  ON viewer_alerts (viewer_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS viewer_alert_settings (
  viewer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'email',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (viewer_id, kind)
);

CREATE TABLE ai_rails_next (
  viewer_id TEXT PRIMARY KEY,
  revision TEXT NOT NULL DEFAULT '',
  generation_id TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '[]',
  attempted_revision TEXT,
  attempted_at TEXT,
  claim_revision TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_rails_next (viewer_id, revision, generation_id, payload, created_at)
SELECT viewer_id, '', '', payload, created_at FROM ai_rails;

DROP TABLE ai_rails;

ALTER TABLE ai_rails_next RENAME TO ai_rails;

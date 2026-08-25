ALTER TABLE revival_works ADD COLUMN group_id TEXT;

ALTER TABLE revival_works ADD COLUMN group_primary INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_revival_works_group
  ON revival_works (group_id, group_primary DESC);

CREATE INDEX IF NOT EXISTS idx_revival_works_primary
  ON revival_works (status, group_primary, popularity DESC);

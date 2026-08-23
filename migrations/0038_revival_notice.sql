ALTER TABLE revival_works ADD COLUMN content_notice TEXT;

CREATE INDEX IF NOT EXISTS revival_works_notice_idx
  ON revival_works (content_notice)
  WHERE content_notice IS NOT NULL;

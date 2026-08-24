ALTER TABLE revival_works ADD COLUMN downloads INTEGER;

CREATE INDEX IF NOT EXISTS idx_revival_works_downloads
  ON revival_works (status, downloads DESC);

ALTER TABLE revival_works ADD COLUMN popularity INTEGER;

CREATE INDEX IF NOT EXISTS idx_revival_works_popularity
  ON revival_works (status, popularity DESC);

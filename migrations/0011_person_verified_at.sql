ALTER TABLE catalog_people ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS catalog_people_verified_idx
  ON catalog_people (verified_at NULLS FIRST, titles DESC);

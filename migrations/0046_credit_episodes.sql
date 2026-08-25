ALTER TABLE catalog_credits ADD COLUMN season_number INTEGER;

ALTER TABLE catalog_credits ADD COLUMN episode_number INTEGER;

ALTER TABLE catalog_credits ADD COLUMN episode_count INTEGER;

DROP INDEX IF EXISTS catalog_credits_title_idx;

CREATE INDEX IF NOT EXISTS catalog_credits_title_idx
  ON catalog_credits (title_id, season_number, episode_number, department, billing);

CREATE INDEX IF NOT EXISTS catalog_credits_episode_idx
  ON catalog_credits (title_id, season_number, episode_number);

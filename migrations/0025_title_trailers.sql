ALTER TABLE catalog_title_videos
  ADD COLUMN source TEXT NOT NULL DEFAULT 'tmdb',
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN views INTEGER,
  ADD COLUMN first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX catalog_title_videos_published_idx
  ON catalog_title_videos (published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX catalog_title_videos_first_seen_idx
  ON catalog_title_videos (first_seen_at DESC);

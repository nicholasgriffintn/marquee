ALTER TABLE viewer_preferences
  ADD COLUMN muted_genres TEXT NOT NULL DEFAULT '[]';

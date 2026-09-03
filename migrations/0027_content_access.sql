ALTER TABLE viewer_preferences
  ADD COLUMN adult_confirmed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN offensive_content_approved INTEGER NOT NULL DEFAULT 0;

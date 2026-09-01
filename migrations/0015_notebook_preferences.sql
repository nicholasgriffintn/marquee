ALTER TABLE viewer_preferences
  ADD COLUMN preferred_cinema_id TEXT REFERENCES cinemas(id) ON DELETE SET NULL,
  ADD COLUMN preferred_location TEXT,
  ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE viewer_preferences
  ADD CONSTRAINT viewer_preferences_language_check
    CHECK (preferred_language ~ '^[a-z]{2}$'),
  ADD CONSTRAINT viewer_preferences_cinema_location_check
    CHECK (
      (preferred_cinema_id IS NULL AND preferred_location IS NULL)
      OR
      (preferred_cinema_id IS NOT NULL AND char_length(preferred_location) BETWEEN 2 AND 120)
    );

CREATE INDEX viewer_preferences_cinema_idx
  ON viewer_preferences (preferred_cinema_id)
  WHERE preferred_cinema_id IS NOT NULL;

ALTER TABLE title_buzz ADD COLUMN source TEXT NOT NULL DEFAULT 'search';

CREATE INDEX IF NOT EXISTS title_buzz_views_idx ON title_buzz (views DESC);

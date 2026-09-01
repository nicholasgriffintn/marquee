ALTER TABLE ai_rails
  ADD COLUMN dirty_revision TEXT,
  ADD COLUMN dirty_since TIMESTAMPTZ,
  ADD COLUMN dirty_at TIMESTAMPTZ,
  ADD COLUMN refresh_due_at TIMESTAMPTZ,
  ADD COLUMN refresh_token TEXT;

CREATE INDEX ai_rails_refresh_due_idx
  ON ai_rails (refresh_due_at)
  WHERE refresh_token IS NOT NULL;

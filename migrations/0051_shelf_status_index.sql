CREATE INDEX IF NOT EXISTS viewing_entries_viewer_status_idx
  ON viewing_entries (viewer_id, status, updated_at DESC);

ALTER TABLE viewing_events
  ADD COLUMN IF NOT EXISTS watched SMALLINT;

ALTER TABLE viewing_events
  DROP CONSTRAINT IF EXISTS viewing_events_watched_check;

ALTER TABLE viewing_events
  ADD CONSTRAINT viewing_events_watched_check
  CHECK (watched IS NULL OR watched IN (0, 1));

UPDATE viewing_events
   SET watched = CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END
 WHERE watched IS NULL AND event_type IN ('watch', 'episode_watch');

ALTER TABLE viewing_events
  DROP CONSTRAINT IF EXISTS viewing_events_episode_watch_check;

ALTER TABLE viewing_events
  ADD CONSTRAINT viewing_events_episode_watch_check
  CHECK (event_type <> 'episode_watch' OR watched IS NOT NULL);

ALTER TABLE viewer_import_runs
  DROP CONSTRAINT IF EXISTS viewer_import_runs_input_kind_check;

ALTER TABLE viewer_import_runs
  ADD CONSTRAINT viewer_import_runs_input_kind_check
  CHECK (input_kind IN ('connected_api', 'official_export', 'generic_json', 'generic_csv'));

ALTER TABLE viewing_entries
  ALTER COLUMN status_source SET DEFAULT 'marquee';

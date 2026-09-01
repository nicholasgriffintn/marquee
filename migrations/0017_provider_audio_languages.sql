CREATE TABLE catalog_title_provider_languages (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'subtitle')),
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2}$'),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id, kind, language)
);

CREATE INDEX catalog_title_provider_languages_lookup_idx
  ON catalog_title_provider_languages (title_id, kind, provider_id, language);

-- Revisit active titles promptly so audio metadata does not wait for the normal stale window.
UPDATE catalog_titles AS t
   SET enriched_at = NULL
 WHERE EXISTS (
   SELECT 1 FROM title_working_set AS w WHERE w.title_id = t.id
 );

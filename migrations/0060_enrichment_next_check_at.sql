-- Precompute the "due" timestamp for each enrichment row at write time so the
-- enrichment scheduler queries can be index-driven instead of scanning
-- catalog_titles in popularity order and evaluating a date-math predicate
-- against every joined row (see worker/repositories/enrichment.ts).
ALTER TABLE title_enrichment ADD COLUMN next_check_at TEXT;

CREATE INDEX IF NOT EXISTS title_enrichment_next_check_idx
  ON title_enrichment (source, next_check_at);

-- The existing PK is (title_id, source), which cannot serve a lookup keyed by
-- source first (e.g. the NOT EXISTS anti-join used to find titles with no
-- enrichment row yet). Add the source-first composite explicitly.
CREATE INDEX IF NOT EXISTS title_enrichment_source_title_idx
  ON title_enrichment (source, title_id);

-- Backfill existing rows using each source's fixed window, matching the
-- formula previously evaluated at read time in dueForEnrichment():
--   miss = 0: fetched_at + maxAgeDays
--   miss = 1: fetched_at + min(attempts * missBackoffDays, 120) days
--   miss = 2: fetched_at + min(attempts * 1, 24) hours
-- window constants come from worker/jobs/enrichment.ts's ENRICHERS config.

-- omdb: maxAgeDays = 14, missBackoffDays = 10
UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+14 days')
WHERE source = 'omdb' AND miss = 0;

UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+' || min(attempts * 10, 120) || ' days')
WHERE source = 'omdb' AND miss = 1;

-- poster: maxAgeDays = 365, missBackoffDays = 30
UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+365 days')
WHERE source = 'poster' AND miss = 0;

UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+' || min(attempts * 30, 120) || ' days')
WHERE source = 'poster' AND miss = 1;

-- mal: maxAgeDays = 14, missBackoffDays = 3
UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+14 days')
WHERE source = 'mal' AND miss = 0;

UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+' || min(attempts * 3, 120) || ' days')
WHERE source = 'mal' AND miss = 1;

-- anilist: maxAgeDays = 1, missBackoffDays = 3
UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+1 days')
WHERE source = 'anilist' AND miss = 0;

UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+' || min(attempts * 3, 120) || ' days')
WHERE source = 'anilist' AND miss = 1;

-- Transient failures (miss = 2) use a fixed retry window regardless of
-- source (TRANSIENT_RETRY_HOURS = 1, TRANSIENT_RETRY_CAP_HOURS = 24).
UPDATE title_enrichment
SET next_check_at = datetime(fetched_at, '+' || min(attempts * 1, 24) || ' hours')
WHERE miss = 2;

-- Safety net for any row left unset (e.g. a source outside the fixed
-- scheduler config): fall back to fetched_at so it reads as due for
-- reconsideration rather than being permanently skipped.
UPDATE title_enrichment
SET next_check_at = fetched_at
WHERE next_check_at IS NULL;

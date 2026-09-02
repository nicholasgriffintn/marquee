UPDATE viewing_episode_entries
SET watched = 1,
    watched_at = COALESCE(watched_at, updated_at)
WHERE scope = 'episode'
  AND watched = 0
  AND (rating IS NOT NULL OR trim(notes) <> '');

WITH series_progress AS (
  SELECT
    shelf.viewer_id,
    shelf.title_id,
    count(*) FILTER (
      WHERE entries.scope = 'episode'
        AND entries.season_number > 0
        AND entries.watched = 1
    )::integer AS watched,
    round(avg(entries.rating) FILTER (
      WHERE entries.scope = 'episode'
        AND entries.season_number > 0
        AND entries.rating IS NOT NULL
    ))::integer AS rating
  FROM viewing_entries AS shelf
  JOIN catalog_titles AS titles ON titles.id = shelf.title_id AND titles.media_type = 'tv'
  LEFT JOIN viewing_episode_entries AS entries
    ON entries.viewer_id = shelf.viewer_id AND entries.title_id = shelf.title_id
  GROUP BY shelf.viewer_id, shelf.title_id
),
aired_progress AS (
  SELECT
    titles.id AS title_id,
    COALESCE(sum(
      CASE
        WHEN jsonb_typeof(seasons.payload::jsonb) = 'array'
          AND jsonb_array_length(seasons.payload::jsonb) > 0
        THEN (
          SELECT count(*)
          FROM jsonb_array_elements(seasons.payload::jsonb) AS episode
          WHERE nullif(episode->>'airDate', '') IS NOT NULL
            AND (episode->>'airDate')::date <= CURRENT_DATE
        )
        WHEN seasons.air_date <= CURRENT_DATE THEN seasons.episode_count
        ELSE 0
      END
    ), 0)::integer AS aired
  FROM catalog_titles AS titles
  LEFT JOIN catalog_seasons AS seasons
    ON seasons.title_id = titles.id AND seasons.season_number > 0
  WHERE titles.media_type = 'tv'
  GROUP BY titles.id
)
UPDATE viewing_entries AS shelf
SET
  status = CASE
    WHEN shelf.status = 'dropped' THEN shelf.status
    WHEN progress.watched = 0 THEN 'watchlist'
    WHEN aired.aired > 0 AND progress.watched >= aired.aired THEN 'watched'
    ELSE 'watching'
  END,
  rating = progress.rating,
  status_source = CASE WHEN shelf.status = 'dropped' THEN shelf.status_source ELSE 'episodes' END,
  rating_source = CASE WHEN progress.rating IS NULL THEN NULL ELSE 'episodes' END,
  projected_at = CURRENT_TIMESTAMP
FROM series_progress AS progress
JOIN aired_progress AS aired ON aired.title_id = progress.title_id
WHERE shelf.viewer_id = progress.viewer_id AND shelf.title_id = progress.title_id;

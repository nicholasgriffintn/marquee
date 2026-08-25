UPDATE catalog_titles SET
  vote_count = MAX(0, COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0)),
  weighted_rating = CASE WHEN (
    1.0 +
    CASE WHEN json_extract(payload, '$.ratings.imdbScore') IS NULL THEN 0 ELSE 1.3 END +
    CASE WHEN json_extract(payload, '$.ratings.rottenTomatoes') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.metascore') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.animeScore') IS NULL THEN 0 ELSE 0.8 END
  ) = 0 THEN 0 ELSE (
    1.0 * ((MAX(0, COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0)) * COALESCE(json_extract(payload, '$.tmdbScore'), 0) + 250 * 6.5) / (MAX(0, COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0)) + 250)) +
    CASE WHEN json_extract(payload, '$.ratings.imdbScore') IS NULL THEN 0 ELSE 1.3 * ((MAX(0, COALESCE(json_extract(payload, '$.ratings.imdbVotes'), 0)) * COALESCE(json_extract(payload, '$.ratings.imdbScore'), 0) + 250 * 6.5) / (MAX(0, COALESCE(json_extract(payload, '$.ratings.imdbVotes'), 0)) + 250)) END +
    CASE WHEN json_extract(payload, '$.ratings.rottenTomatoes') IS NULL THEN 0 ELSE 0.8 * (CAST(replace(COALESCE(json_extract(payload, '$.ratings.rottenTomatoes'), '0'), '%', '') AS REAL) / 10.0) END +
    CASE WHEN json_extract(payload, '$.ratings.metascore') IS NULL THEN 0 ELSE 0.8 * (COALESCE(json_extract(payload, '$.ratings.metascore'), 0) / 10.0) END +
    CASE WHEN json_extract(payload, '$.ratings.animeScore') IS NULL THEN 0 ELSE 0.8 * COALESCE(json_extract(payload, '$.ratings.animeScore'), 0) END
  ) / (
    1.0 +
    CASE WHEN json_extract(payload, '$.ratings.imdbScore') IS NULL THEN 0 ELSE 1.3 END +
    CASE WHEN json_extract(payload, '$.ratings.rottenTomatoes') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.metascore') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.animeScore') IS NULL THEN 0 ELSE 0.8 END
  ) END,
  blended_rating = CASE WHEN (
    CASE WHEN json_extract(payload, '$.tmdbScore') IS NULL THEN 0 ELSE 1.0 END +
    CASE WHEN json_extract(payload, '$.ratings.imdbScore') IS NULL THEN 0 ELSE 1.3 END +
    CASE WHEN json_extract(payload, '$.ratings.rottenTomatoes') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.metascore') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.animeScore') IS NULL THEN 0 ELSE 0.8 END
  ) = 0 THEN 0 ELSE (
    CASE WHEN json_extract(payload, '$.tmdbScore') IS NULL THEN 0 ELSE 1.0 * COALESCE(json_extract(payload, '$.tmdbScore'), 0) END +
    CASE WHEN json_extract(payload, '$.ratings.imdbScore') IS NULL THEN 0 ELSE 1.3 * COALESCE(json_extract(payload, '$.ratings.imdbScore'), 0) END +
    CASE WHEN json_extract(payload, '$.ratings.rottenTomatoes') IS NULL THEN 0 ELSE 0.8 * (CAST(replace(COALESCE(json_extract(payload, '$.ratings.rottenTomatoes'), '0'), '%', '') AS REAL) / 10.0) END +
    CASE WHEN json_extract(payload, '$.ratings.metascore') IS NULL THEN 0 ELSE 0.8 * (COALESCE(json_extract(payload, '$.ratings.metascore'), 0) / 10.0) END +
    CASE WHEN json_extract(payload, '$.ratings.animeScore') IS NULL THEN 0 ELSE 0.8 * COALESCE(json_extract(payload, '$.ratings.animeScore'), 0) END
  ) / (
    CASE WHEN json_extract(payload, '$.tmdbScore') IS NULL THEN 0 ELSE 1.0 END +
    CASE WHEN json_extract(payload, '$.ratings.imdbScore') IS NULL THEN 0 ELSE 1.3 END +
    CASE WHEN json_extract(payload, '$.ratings.rottenTomatoes') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.metascore') IS NULL THEN 0 ELSE 0.8 END +
    CASE WHEN json_extract(payload, '$.ratings.animeScore') IS NULL THEN 0 ELSE 0.8 END
  ) END
WHERE rowid % 120 = 15;

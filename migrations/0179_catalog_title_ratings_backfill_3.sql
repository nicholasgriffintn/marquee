INSERT OR IGNORE INTO catalog_title_ratings
  (title_id, imdb_score, imdb_votes, rotten_tomatoes, metascore, awards, award_wins, box_office, anime_score, anime_votes)
SELECT id,
  json_extract(payload, '$.ratings.imdbScore'),
  json_extract(payload, '$.ratings.imdbVotes'),
  json_extract(payload, '$.ratings.rottenTomatoes'),
  json_extract(payload, '$.ratings.metascore'),
  json_extract(payload, '$.ratings.awards'),
  json_extract(payload, '$.ratings.awardWins'),
  json_extract(payload, '$.ratings.boxOffice'),
  json_extract(payload, '$.ratings.animeScore'),
  json_extract(payload, '$.ratings.animeVotes')
FROM catalog_titles
WHERE (rowid % 8) = 3 AND json_extract(payload, '$.ratings') IS NOT NULL;

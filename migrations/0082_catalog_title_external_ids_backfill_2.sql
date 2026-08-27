INSERT OR IGNORE INTO catalog_title_external_ids
  (title_id, tvdb_id, facebook_id, instagram_id, twitter_id, anidb_id, kitsu_id,
   ani_search_id, anime_planet_id, livechart_id, animenewsnetwork_id, animecountdown_id)
SELECT id,
  json_extract(payload, '$.externalIds.tvdbId'),
  json_extract(payload, '$.externalIds.facebookId'),
  json_extract(payload, '$.externalIds.instagramId'),
  json_extract(payload, '$.externalIds.twitterId'),
  json_extract(payload, '$.externalIds.anidbId'),
  json_extract(payload, '$.externalIds.kitsuId'),
  json_extract(payload, '$.externalIds.aniSearchId'),
  json_extract(payload, '$.externalIds.animePlanetId'),
  json_extract(payload, '$.externalIds.livechartId'),
  json_extract(payload, '$.externalIds.animeNewsNetworkId'),
  json_extract(payload, '$.externalIds.animeCountdownId')
FROM catalog_titles
WHERE (rowid % 2) = 1 AND json_extract(payload, '$.externalIds') IS NOT NULL;

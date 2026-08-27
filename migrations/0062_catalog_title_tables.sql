CREATE TABLE IF NOT EXISTS catalog_title_genres (
  title_id TEXT NOT NULL,
  genre TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, genre)
);

CREATE INDEX IF NOT EXISTS catalog_title_genres_genre_idx
  ON catalog_title_genres (genre, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_keywords (
  title_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, keyword)
);

CREATE INDEX IF NOT EXISTS catalog_title_keywords_keyword_idx
  ON catalog_title_keywords (keyword, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_studios (
  title_id TEXT NOT NULL,
  studio TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, studio)
);

CREATE INDEX IF NOT EXISTS catalog_title_studios_studio_idx
  ON catalog_title_studios (studio, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_people (
  title_id TEXT NOT NULL,
  person TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, person)
);

CREATE TABLE IF NOT EXISTS catalog_title_recommendation_ids (
  title_id TEXT NOT NULL,
  recommended_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, recommended_id)
);

CREATE TABLE IF NOT EXISTS catalog_title_countries (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'origin', 'production')),
  country TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, country)
);

CREATE TABLE IF NOT EXISTS catalog_title_languages (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'spoken')),
  language TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, language)
);

CREATE TABLE IF NOT EXISTS catalog_title_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

CREATE TABLE IF NOT EXISTS catalog_title_providers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  web_url TEXT,
  source TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id)
);

CREATE TABLE IF NOT EXISTS catalog_title_provider_offers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id, offer_type)
);

CREATE INDEX IF NOT EXISTS catalog_title_provider_offers_type_idx
  ON catalog_title_provider_offers (offer_type, provider_id, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_details (
  title_id TEXT PRIMARY KEY,
  homepage TEXT,
  trailer_key TEXT,
  tagline TEXT,
  budget INTEGER,
  episode_count INTEGER,
  last_air_date TEXT,
  next_air_date TEXT,
  pending INTEGER
);

CREATE TABLE IF NOT EXISTS catalog_title_ratings (
  title_id TEXT PRIMARY KEY,
  imdb_score REAL,
  imdb_votes INTEGER,
  rotten_tomatoes TEXT,
  metascore INTEGER,
  awards TEXT,
  award_wins INTEGER,
  box_office INTEGER,
  anime_score REAL,
  anime_votes INTEGER
);

CREATE TABLE IF NOT EXISTS catalog_title_external_ids (
  title_id TEXT PRIMARY KEY,
  tvdb_id INTEGER,
  facebook_id TEXT,
  instagram_id TEXT,
  twitter_id TEXT,
  anidb_id INTEGER,
  kitsu_id INTEGER,
  ani_search_id INTEGER,
  anime_planet_id TEXT,
  livechart_id INTEGER,
  animenewsnetwork_id INTEGER,
  animecountdown_id INTEGER
);

INSERT OR IGNORE INTO catalog_title_genres (title_id, genre, position)
SELECT catalog_titles.id, g.value, g.key
FROM catalog_titles, json_each(payload, '$.genres') AS g
WHERE g.value IS NOT NULL AND g.value <> '';

INSERT OR IGNORE INTO catalog_title_keywords (title_id, keyword, position)
SELECT catalog_titles.id, k.value, k.key
FROM catalog_titles, json_each(payload, '$.keywords') AS k
WHERE k.value IS NOT NULL AND k.value <> '';

INSERT OR IGNORE INTO catalog_title_studios (title_id, studio, position)
SELECT catalog_titles.id, s.value, s.key
FROM catalog_titles, json_each(payload, '$.studios') AS s
WHERE s.value IS NOT NULL AND s.value <> '';

INSERT OR IGNORE INTO catalog_title_people (title_id, person, position)
SELECT catalog_titles.id, p.value, p.key
FROM catalog_titles, json_each(payload, '$.people') AS p
WHERE p.value IS NOT NULL AND p.value <> '';

INSERT OR IGNORE INTO catalog_title_recommendation_ids (title_id, recommended_id, position)
SELECT catalog_titles.id, r.value, r.key
FROM catalog_titles, json_each(payload, '$.recommendationIds') AS r
WHERE r.value IS NOT NULL AND r.value <> '';

INSERT OR IGNORE INTO catalog_title_countries (title_id, kind, country, position)
SELECT catalog_titles.id, 'general', c.value, c.key
FROM catalog_titles, json_each(payload, '$.countries') AS c
WHERE c.value IS NOT NULL AND c.value <> ''
UNION ALL
SELECT catalog_titles.id, 'origin', c.value, c.key
FROM catalog_titles, json_each(payload, '$.originCountries') AS c
WHERE c.value IS NOT NULL AND c.value <> ''
UNION ALL
SELECT catalog_titles.id, 'production', c.value, c.key
FROM catalog_titles, json_each(payload, '$.productionCountries') AS c
WHERE c.value IS NOT NULL AND c.value <> '';

INSERT OR IGNORE INTO catalog_title_languages (title_id, kind, language, position)
SELECT catalog_titles.id, 'general', l.value, l.key
FROM catalog_titles, json_each(payload, '$.languages') AS l
WHERE l.value IS NOT NULL AND l.value <> ''
UNION ALL
SELECT catalog_titles.id, 'spoken', l.value, l.key
FROM catalog_titles, json_each(payload, '$.spokenLanguages') AS l
WHERE l.value IS NOT NULL AND l.value <> '';

INSERT OR IGNORE INTO catalog_title_videos (title_id, video_key, name, type, position)
SELECT catalog_titles.id,
  json_extract(v.value, '$.key'),
  json_extract(v.value, '$.name'),
  json_extract(v.value, '$.type'),
  v.key
FROM catalog_titles, json_each(payload, '$.videos') AS v
WHERE json_extract(v.value, '$.key') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_providers (title_id, provider_id, name, web_url, source, position)
SELECT catalog_titles.id,
  json_extract(p.value, '$.id'),
  json_extract(p.value, '$.name'),
  json_extract(p.value, '$.webUrl'),
  json_extract(p.value, '$.source'),
  p.key
FROM catalog_titles, json_each(payload, '$.providers') AS p
WHERE json_extract(p.value, '$.id') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_provider_offers (title_id, provider_id, offer_type, position)
SELECT catalog_titles.id, json_extract(p.value, '$.id'), o.value, o.key
FROM catalog_titles, json_each(payload, '$.providers') AS p,
     json_each(json_extract(p.value, '$.offerTypes')) AS o
WHERE json_extract(p.value, '$.id') IS NOT NULL AND o.value IS NOT NULL AND o.value <> '';

INSERT OR IGNORE INTO catalog_title_details
  (title_id, homepage, trailer_key, tagline, budget, episode_count, last_air_date, next_air_date, pending)
SELECT id,
  json_extract(payload, '$.homepage'),
  json_extract(payload, '$.trailerKey'),
  json_extract(payload, '$.tagline'),
  json_extract(payload, '$.budget'),
  json_extract(payload, '$.episodeCount'),
  json_extract(payload, '$.lastAirDate'),
  json_extract(payload, '$.nextAirDate'),
  json_extract(payload, '$.pending')
FROM catalog_titles
WHERE COALESCE(
  json_extract(payload, '$.homepage'),
  json_extract(payload, '$.trailerKey'),
  json_extract(payload, '$.tagline'),
  json_extract(payload, '$.budget'),
  json_extract(payload, '$.episodeCount'),
  json_extract(payload, '$.lastAirDate'),
  json_extract(payload, '$.nextAirDate'),
  json_extract(payload, '$.pending')
) IS NOT NULL;

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
WHERE json_extract(payload, '$.ratings') IS NOT NULL;

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
WHERE json_extract(payload, '$.externalIds') IS NOT NULL;

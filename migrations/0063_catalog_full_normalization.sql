ALTER TABLE catalog_titles ADD COLUMN overview TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_titles ADD COLUMN number_of_seasons INTEGER;
ALTER TABLE catalog_titles ADD COLUMN tmdb_score REAL;
ALTER TABLE catalog_titles ADD COLUMN poster_url TEXT;
ALTER TABLE catalog_titles ADD COLUMN backdrop_url TEXT;
ALTER TABLE catalog_titles ADD COLUMN watch_link TEXT;

UPDATE catalog_titles SET
  overview = COALESCE(json_extract(payload, '$.overview'), ''),
  number_of_seasons = json_extract(payload, '$.numberOfSeasons'),
  tmdb_score = json_extract(payload, '$.tmdbScore'),
  poster_url = json_extract(payload, '$.posterUrl'),
  backdrop_url = json_extract(payload, '$.backdropUrl'),
  watch_link = json_extract(payload, '$.watchLink');

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

INSERT INTO catalog_title_details
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
WHERE json_extract(payload, '$.homepage') IS NOT NULL
   OR json_extract(payload, '$.trailerKey') IS NOT NULL
   OR json_extract(payload, '$.tagline') IS NOT NULL
   OR json_extract(payload, '$.budget') IS NOT NULL
   OR json_extract(payload, '$.episodeCount') IS NOT NULL
   OR json_extract(payload, '$.lastAirDate') IS NOT NULL
   OR json_extract(payload, '$.nextAirDate') IS NOT NULL
   OR json_extract(payload, '$.pending') IS NOT NULL;

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

INSERT INTO catalog_title_ratings
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

CREATE INDEX IF NOT EXISTS catalog_title_ratings_award_wins_idx
  ON catalog_title_ratings (award_wins);

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

INSERT INTO catalog_title_external_ids
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

CREATE TABLE IF NOT EXISTS catalog_title_anime (
  title_id TEXT PRIMARY KEY,
  format TEXT,
  episodes INTEGER,
  duration_minutes INTEGER,
  season TEXT,
  season_year INTEGER,
  source TEXT,
  romaji_title TEXT,
  english_title TEXT,
  native_title TEXT,
  broadcast TEXT,
  airing INTEGER,
  background TEXT,
  rank INTEGER,
  popularity INTEGER,
  members INTEGER,
  favorites INTEGER,
  key_visual_url TEXT,
  status_breakdown_watching INTEGER,
  status_breakdown_completed INTEGER,
  status_breakdown_on_hold INTEGER,
  status_breakdown_dropped INTEGER,
  status_breakdown_plan_to_watch INTEGER
);

INSERT INTO catalog_title_anime
  (title_id, format, episodes, duration_minutes, season, season_year, source,
   romaji_title, english_title, native_title, broadcast, airing, background,
   rank, popularity, members, favorites, key_visual_url,
   status_breakdown_watching, status_breakdown_completed, status_breakdown_on_hold,
   status_breakdown_dropped, status_breakdown_plan_to_watch)
SELECT id,
  json_extract(payload, '$.anime.format'),
  json_extract(payload, '$.anime.episodes'),
  json_extract(payload, '$.anime.durationMinutes'),
  json_extract(payload, '$.anime.season'),
  json_extract(payload, '$.anime.seasonYear'),
  json_extract(payload, '$.anime.source'),
  json_extract(payload, '$.anime.romajiTitle'),
  json_extract(payload, '$.anime.englishTitle'),
  json_extract(payload, '$.anime.nativeTitle'),
  json_extract(payload, '$.anime.broadcast'),
  json_extract(payload, '$.anime.airing'),
  json_extract(payload, '$.anime.background'),
  json_extract(payload, '$.anime.rank'),
  json_extract(payload, '$.anime.popularity'),
  json_extract(payload, '$.anime.members'),
  json_extract(payload, '$.anime.favorites'),
  json_extract(payload, '$.anime.keyVisualUrl'),
  json_extract(payload, '$.anime.statusBreakdown.watching'),
  json_extract(payload, '$.anime.statusBreakdown.completed'),
  json_extract(payload, '$.anime.statusBreakdown.onHold'),
  json_extract(payload, '$.anime.statusBreakdown.dropped'),
  json_extract(payload, '$.anime.statusBreakdown.planToWatch')
FROM catalog_titles
WHERE json_extract(payload, '$.anime') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_synonyms (
  title_id TEXT NOT NULL,
  synonym TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, synonym)
);

INSERT INTO catalog_title_anime_synonyms (title_id, synonym, position)
SELECT catalog_titles.id, s.value, s.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.synonyms')) AS s
WHERE s.value IS NOT NULL AND s.value <> '';

CREATE TABLE IF NOT EXISTS catalog_title_anime_relations (
  title_id TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  format TEXT,
  title TEXT NOT NULL,
  year INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, mal_id, relation)
);

CREATE INDEX IF NOT EXISTS catalog_title_anime_relations_title_idx
  ON catalog_title_anime_relations (title_id, position);

INSERT INTO catalog_title_anime_relations (title_id, mal_id, relation, format, title, year, position)
SELECT catalog_titles.id,
  json_extract(r.value, '$.malId'),
  json_extract(r.value, '$.relation'),
  json_extract(r.value, '$.format'),
  json_extract(r.value, '$.title'),
  json_extract(r.value, '$.year'),
  r.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.relations')) AS r
WHERE json_extract(r.value, '$.malId') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_streams (
  title_id TEXT NOT NULL,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, site)
);

INSERT INTO catalog_title_anime_streams (title_id, site, url, position)
SELECT catalog_titles.id, json_extract(v.value, '$.site'), json_extract(v.value, '$.url'), v.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.streams')) AS v
WHERE json_extract(v.value, '$.site') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_characters (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  voice_actor TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name, role)
);

CREATE INDEX IF NOT EXISTS catalog_title_anime_characters_title_idx
  ON catalog_title_anime_characters (title_id, position);

INSERT INTO catalog_title_anime_characters (title_id, name, role, voice_actor, position)
SELECT catalog_titles.id,
  json_extract(c.value, '$.name'),
  json_extract(c.value, '$.role'),
  json_extract(c.value, '$.voiceActor'),
  c.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.characters')) AS c
WHERE json_extract(c.value, '$.name') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_staff (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name, role)
);

CREATE INDEX IF NOT EXISTS catalog_title_anime_staff_title_idx
  ON catalog_title_anime_staff (title_id, position);

INSERT INTO catalog_title_anime_staff (title_id, name, role, position)
SELECT catalog_titles.id, json_extract(s.value, '$.name'), json_extract(s.value, '$.role'), s.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.staff')) AS s
WHERE json_extract(s.value, '$.name') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_themes (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'ending')),
  title TEXT NOT NULL,
  artist TEXT,
  episodes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, position)
);

INSERT INTO catalog_title_anime_themes (title_id, kind, title, artist, episodes, position)
SELECT catalog_titles.id, 'opening', json_extract(t.value, '$.title'), json_extract(t.value, '$.artist'),
       json_extract(t.value, '$.episodes'), t.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.openings')) AS t
WHERE json_extract(t.value, '$.title') IS NOT NULL
UNION ALL
SELECT catalog_titles.id, 'ending', json_extract(t.value, '$.title'), json_extract(t.value, '$.artist'),
       json_extract(t.value, '$.episodes'), t.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.endings')) AS t
WHERE json_extract(t.value, '$.title') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_companies (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('licensor', 'producer')),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, name)
);

INSERT INTO catalog_title_anime_companies (title_id, kind, name, position)
SELECT catalog_titles.id, 'licensor', l.value, l.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.licensors')) AS l
WHERE l.value IS NOT NULL AND l.value <> ''
UNION ALL
SELECT catalog_titles.id, 'producer', p.value, p.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.producers')) AS p
WHERE p.value IS NOT NULL AND p.value <> '';

CREATE TABLE IF NOT EXISTS catalog_title_anime_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

INSERT INTO catalog_title_anime_videos (title_id, video_key, name, position)
SELECT catalog_titles.id, json_extract(v.value, '$.key'), json_extract(v.value, '$.name'), v.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.videos')) AS v
WHERE json_extract(v.value, '$.key') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_recommendations (
  title_id TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, mal_id)
);

INSERT INTO catalog_title_anime_recommendations (title_id, mal_id, position)
SELECT catalog_titles.id, r.value, r.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.recommendations')) AS r
WHERE r.value IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_anime_links (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name)
);

INSERT INTO catalog_title_anime_links (title_id, name, url, position)
SELECT catalog_titles.id, json_extract(l.value, '$.name'), json_extract(l.value, '$.url'), l.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.links')) AS l
WHERE json_extract(l.value, '$.name') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_people (
  title_id TEXT NOT NULL,
  person TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, person)
);

INSERT INTO catalog_title_people (title_id, person, position)
SELECT catalog_titles.id, p.value, p.key
FROM catalog_titles, json_each(payload, '$.people') AS p
WHERE p.value IS NOT NULL AND p.value <> '';

CREATE TABLE IF NOT EXISTS catalog_title_countries (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'origin', 'production')),
  country TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, country)
);

INSERT INTO catalog_title_countries (title_id, kind, country, position)
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

CREATE TABLE IF NOT EXISTS catalog_title_languages (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'spoken')),
  language TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, language)
);

INSERT INTO catalog_title_languages (title_id, kind, language, position)
SELECT catalog_titles.id, 'general', l.value, l.key
FROM catalog_titles, json_each(payload, '$.languages') AS l
WHERE l.value IS NOT NULL AND l.value <> ''
UNION ALL
SELECT catalog_titles.id, 'spoken', l.value, l.key
FROM catalog_titles, json_each(payload, '$.spokenLanguages') AS l
WHERE l.value IS NOT NULL AND l.value <> '';

CREATE TABLE IF NOT EXISTS catalog_title_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

INSERT INTO catalog_title_videos (title_id, video_key, name, type, position)
SELECT catalog_titles.id,
  json_extract(v.value, '$.key'),
  json_extract(v.value, '$.name'),
  json_extract(v.value, '$.type'),
  v.key
FROM catalog_titles, json_each(payload, '$.videos') AS v
WHERE json_extract(v.value, '$.key') IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_title_recommendation_ids (
  title_id TEXT NOT NULL,
  recommended_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, recommended_id)
);

INSERT INTO catalog_title_recommendation_ids (title_id, recommended_id, position)
SELECT catalog_titles.id, r.value, r.key
FROM catalog_titles, json_each(payload, '$.recommendationIds') AS r
WHERE r.value IS NOT NULL AND r.value <> '';

CREATE TABLE IF NOT EXISTS catalog_title_providers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  web_url TEXT,
  source TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, provider_id)
);

CREATE INDEX IF NOT EXISTS catalog_title_providers_provider_idx
  ON catalog_title_providers (provider_id, title_id);

CREATE TABLE IF NOT EXISTS catalog_title_provider_offers (
  title_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  offer_type TEXT NOT NULL,
  PRIMARY KEY (title_id, provider_id, offer_type)
);

INSERT INTO catalog_title_providers (title_id, provider_id, name, web_url, source, position)
SELECT catalog_titles.id,
  json_extract(p.value, '$.id'),
  json_extract(p.value, '$.name'),
  json_extract(p.value, '$.webUrl'),
  json_extract(p.value, '$.source'),
  p.key
FROM catalog_titles, json_each(payload, '$.providers') AS p
WHERE json_extract(p.value, '$.id') IS NOT NULL;

INSERT INTO catalog_title_provider_offers (title_id, provider_id, offer_type)
SELECT catalog_titles.id, json_extract(p.value, '$.id'), o.value
FROM catalog_titles, json_each(payload, '$.providers') AS p,
     json_each(json_extract(p.value, '$.offerTypes')) AS o
WHERE json_extract(p.value, '$.id') IS NOT NULL AND o.value IS NOT NULL AND o.value <> '';

DROP TRIGGER IF EXISTS catalog_titles_search_insert;
DROP TRIGGER IF EXISTS catalog_titles_search_update;

CREATE TRIGGER catalog_titles_search_insert
AFTER INSERT ON catalog_titles
BEGIN
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid,
    new.title,
    new.original_title,
    new.overview,
    COALESCE(
      (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), ''
    ) || ' ' || COALESCE(
      (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''
    ),
    COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = new.id), ''),
    new.id
  );
END;

CREATE TRIGGER catalog_titles_search_update
AFTER UPDATE ON catalog_titles
BEGIN
  DELETE FROM catalog_search WHERE rowid = old.rowid;
  INSERT INTO catalog_search (rowid, title, original_title, overview, tags, people, title_id)
  VALUES (
    new.rowid,
    new.title,
    new.original_title,
    new.overview,
    COALESCE(
      (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = new.id), ''
    ) || ' ' || COALESCE(
      (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = new.id), ''
    ),
    COALESCE((SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = new.id), ''),
    new.id
  );
END;

UPDATE catalog_search SET
  overview = (SELECT overview FROM catalog_titles WHERE catalog_titles.id = catalog_search.title_id),
  tags = COALESCE(
    (SELECT group_concat(genre, ' ') FROM catalog_title_genres WHERE title_id = catalog_search.title_id), ''
  ) || ' ' || COALESCE(
    (SELECT group_concat(keyword, ' ') FROM catalog_title_keywords WHERE title_id = catalog_search.title_id), ''
  ),
  people = COALESCE(
    (SELECT group_concat(person, ' ') FROM catalog_title_people WHERE title_id = catalog_search.title_id), ''
  );

ALTER TABLE catalog_titles DROP COLUMN provider_ids;
ALTER TABLE catalog_titles DROP COLUMN payload;

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

CREATE TABLE IF NOT EXISTS catalog_title_anime_synonyms (
  title_id TEXT NOT NULL,
  synonym TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, synonym)
);

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

CREATE TABLE IF NOT EXISTS catalog_title_anime_streams (
  title_id TEXT NOT NULL,
  site TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, site)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_characters (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  voice_actor TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name, role)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_staff (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name, role)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_themes (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'ending')),
  title TEXT NOT NULL,
  artist TEXT,
  episodes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, position)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_companies (
  title_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('licensor', 'producer')),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, kind, name)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_videos (
  title_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, video_key)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_recommendations (
  title_id TEXT NOT NULL,
  mal_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, mal_id)
);

CREATE TABLE IF NOT EXISTS catalog_title_anime_links (
  title_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, name)
);

INSERT OR IGNORE INTO catalog_title_anime
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

INSERT OR IGNORE INTO catalog_title_anime_synonyms (title_id, synonym, position)
SELECT catalog_titles.id, s.value, s.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.synonyms')) AS s
WHERE s.value IS NOT NULL AND s.value <> '';

INSERT OR IGNORE INTO catalog_title_anime_relations (title_id, mal_id, relation, format, title, year, position)
SELECT catalog_titles.id,
  json_extract(r.value, '$.malId'),
  json_extract(r.value, '$.relation'),
  json_extract(r.value, '$.format'),
  json_extract(r.value, '$.title'),
  json_extract(r.value, '$.year'),
  r.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.relations')) AS r
WHERE json_extract(r.value, '$.malId') IS NOT NULL
  AND json_extract(r.value, '$.relation') IS NOT NULL
  AND json_extract(r.value, '$.title') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_streams (title_id, site, url, position)
SELECT catalog_titles.id, json_extract(s.value, '$.site'), json_extract(s.value, '$.url'), s.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.streams')) AS s
WHERE json_extract(s.value, '$.site') IS NOT NULL AND json_extract(s.value, '$.url') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_characters (title_id, name, role, voice_actor, position)
SELECT catalog_titles.id,
  json_extract(c.value, '$.name'),
  json_extract(c.value, '$.role'),
  json_extract(c.value, '$.voiceActor'),
  c.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.characters')) AS c
WHERE json_extract(c.value, '$.name') IS NOT NULL AND json_extract(c.value, '$.role') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_staff (title_id, name, role, position)
SELECT catalog_titles.id, json_extract(s.value, '$.name'), json_extract(s.value, '$.role'), s.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.staff')) AS s
WHERE json_extract(s.value, '$.name') IS NOT NULL AND json_extract(s.value, '$.role') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_themes (title_id, kind, title, artist, episodes, position)
SELECT catalog_titles.id, 'opening', json_extract(t.value, '$.title'), json_extract(t.value, '$.artist'),
       json_extract(t.value, '$.episodes'), t.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.openings')) AS t
WHERE json_extract(t.value, '$.title') IS NOT NULL
UNION ALL
SELECT catalog_titles.id, 'ending', json_extract(t.value, '$.title'), json_extract(t.value, '$.artist'),
       json_extract(t.value, '$.episodes'), t.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.endings')) AS t
WHERE json_extract(t.value, '$.title') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_companies (title_id, kind, name, position)
SELECT catalog_titles.id, 'licensor', l.value, l.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.licensors')) AS l
WHERE l.value IS NOT NULL AND l.value <> ''
UNION ALL
SELECT catalog_titles.id, 'producer', p.value, p.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.producers')) AS p
WHERE p.value IS NOT NULL AND p.value <> '';

INSERT OR IGNORE INTO catalog_title_anime_videos (title_id, video_key, name, position)
SELECT catalog_titles.id, json_extract(v.value, '$.key'), json_extract(v.value, '$.name'), v.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.videos')) AS v
WHERE json_extract(v.value, '$.key') IS NOT NULL AND json_extract(v.value, '$.name') IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_recommendations (title_id, mal_id, position)
SELECT catalog_titles.id, r.value, r.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.recommendations')) AS r
WHERE r.value IS NOT NULL;

INSERT OR IGNORE INTO catalog_title_anime_links (title_id, name, url, position)
SELECT catalog_titles.id, json_extract(l.value, '$.name'), json_extract(l.value, '$.url'), l.key
FROM catalog_titles, json_each(json_extract(payload, '$.anime.links')) AS l
WHERE json_extract(l.value, '$.name') IS NOT NULL AND json_extract(l.value, '$.url') IS NOT NULL;

import { DEMAND_MAX_AGE_DAYS } from "../repositories/working-set.ts";
import type { Bindings } from "../types.ts";
import { EMBEDDING_MODEL } from "./embeddings.ts";

const SAMPLE_LIMIT = 10;

export type SampleRow = Record<string, string | number | null>;
export type SampleResult = { columns: string[]; rows: SampleRow[] };

async function titleSample(
  db: D1Database,
  where: string,
  params: unknown[] = [],
): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, title, media_type AS mediaType, year, updated_at AS updatedAt
       FROM catalog_titles
       WHERE ${where}
       ORDER BY updated_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .bind(...params)
    .all<SampleRow>();

  return {
    columns: ["id", "title", "mediaType", "year", "updatedAt"],
    rows: rows.results,
  };
}

async function workingSetSample(db: D1Database, freshOnly: boolean): Promise<SampleResult> {
  const freshWhere = `t.enriched_at IS NOT NULL AND t.enriched_at > datetime('now', '-${DEMAND_MAX_AGE_DAYS} days')`;
  const rows = await db
    .prepare(
      `SELECT t.id AS id, t.title AS title, t.media_type AS mediaType, w.demand AS demand,
              w.refreshed_at AS refreshedAt
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       ${freshOnly ? `WHERE ${freshWhere}` : ""}
       ORDER BY w.refreshed_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "mediaType", "demand", "refreshedAt"],
    rows: rows.results,
  };
}

async function embeddingsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT e.title_id AS id, t.title AS title, e.model AS model, e.embedded_at AS embeddedAt
       FROM title_embeddings AS e
       JOIN catalog_titles AS t ON t.id = e.title_id
       WHERE e.content_hash IS NOT NULL AND e.model = ?1
       ORDER BY e.embedded_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .bind(EMBEDDING_MODEL)
    .all<SampleRow>();

  return {
    columns: ["id", "title", "model", "embeddedAt"],
    rows: rows.results,
  };
}

async function buzzSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT b.title_id AS id, t.title AS title, b.views AS views, b.delta AS delta,
              b.measured_at AS measuredAt
       FROM title_buzz AS b
       JOIN catalog_titles AS t ON t.id = b.title_id
       WHERE b.article <> ''
       ORDER BY b.measured_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "views", "delta", "measuredAt"],
    rows: rows.results,
  };
}

async function upcomingSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, show_name AS title, season, episode, airs_at AS airsAt
       FROM title_schedule
       WHERE airs_at >= datetime('now')
       ORDER BY airs_at ASC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "season", "episode", "airsAt"],
    rows: rows.results,
  };
}

async function sectionsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, title, json_array_length(title_ids) AS titles, source_updated_at AS builtAt
       FROM catalog_sections
       ORDER BY source_updated_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["id", "title", "titles", "builtAt"], rows: rows.results };
}

async function peopleSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT name, known_for AS knownFor, titles, popularity
       FROM catalog_people
       ORDER BY popularity DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["name", "knownFor", "titles", "popularity"], rows: rows.results };
}

async function seasonsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT s.title_id AS id, t.title AS title, s.season_number AS season, s.name AS name,
              s.fetched_at AS fetchedAt
       FROM catalog_seasons AS s
       JOIN catalog_titles AS t ON t.id = s.title_id
       ORDER BY s.fetched_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "season", "name", "fetchedAt"],
    rows: rows.results,
  };
}

async function insightsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT i.title_id AS id, t.title AS title, i.created_at AS createdAt
       FROM title_insights AS i
       JOIN catalog_titles AS t ON t.id = i.title_id
       ORDER BY i.created_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["id", "title", "createdAt"], rows: rows.results };
}

async function revivalSample(db: D1Database, where: string): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, title, year, status, mirror_state AS mirrorState, updated_at AS updatedAt
       FROM revival_works
       WHERE ${where}
       ORDER BY updated_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "year", "status", "mirrorState", "updatedAt"],
    rows: rows.results,
  };
}

async function railsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT viewer_id AS viewerId, signature, created_at AS createdAt
       FROM ai_rails
       ORDER BY created_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["viewerId", "signature", "createdAt"],
    rows: rows.results,
  };
}

async function pinnedShelvesSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, viewer_id AS viewerId, name, created_at AS createdAt
       FROM pinned_shelves
       ORDER BY created_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "viewerId", "name", "createdAt"],
    rows: rows.results,
  };
}

async function cinemasSample(db: D1Database, placedOnly: boolean): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, name, chain, source, updated_at AS updatedAt
       FROM cinemas
       ${placedOnly ? "WHERE latitude IS NOT NULL" : ""}
       ORDER BY updated_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "name", "chain", "source", "updatedAt"],
    rows: rows.results,
  };
}

async function cinemaFilmsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT source, source_film_id AS sourceFilmId, source_title AS sourceTitle,
              title_id AS titleId, confidence, matched_at AS matchedAt
       FROM cinema_films
       ORDER BY matched_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["source", "sourceFilmId", "sourceTitle", "titleId", "confidence", "matchedAt"],
    rows: rows.results,
  };
}

async function screeningsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, cinema_id AS cinemaId, title_id AS titleId, business_day AS businessDay,
              starts_at AS startsAt
       FROM cinema_screenings
       WHERE business_day >= date('now')
       ORDER BY business_day ASC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "cinemaId", "titleId", "businessDay", "startsAt"],
    rows: rows.results,
  };
}

async function interestCellsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT cell, latitude, longitude, hits, last_seen_at AS lastSeenAt
       FROM cinema_interest
       ORDER BY last_seen_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["cell", "latitude", "longitude", "hits", "lastSeenAt"],
    rows: rows.results,
  };
}

async function usersSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, name, github_login AS login, created_at AS createdAt
       FROM users
       ORDER BY created_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["id", "name", "login", "createdAt"], rows: rows.results };
}

async function alertReadySample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, name, github_login AS login, alert_email_verified_at AS verifiedAt
       FROM users
       WHERE alert_email_verified_at IS NOT NULL
       ORDER BY alert_email_verified_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["id", "name", "login", "verifiedAt"], rows: rows.results };
}

async function viewerAlertsSample(db: D1Database, weekOnly: boolean): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT viewer_id AS viewerId, title_id AS titleId, kind, sent_at AS sentAt
       FROM viewer_alerts
       ${weekOnly ? "WHERE julianday(sent_at) > julianday('now', '-7 days')" : ""}
       ORDER BY sent_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["viewerId", "titleId", "kind", "sentAt"],
    rows: rows.results,
  };
}

async function signalsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, viewer_id AS viewerId, type, title_id AS titleId, created_at AS createdAt
       FROM viewer_signals
       ORDER BY created_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "viewerId", "type", "titleId", "createdAt"],
    rows: rows.results,
  };
}

async function beliefsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, viewer_id AS viewerId, key, value, strength, confidence, updated_at AS updatedAt
       FROM viewer_beliefs
       WHERE revoked_at IS NULL
       ORDER BY updated_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "viewerId", "key", "value", "strength", "confidence", "updatedAt"],
    rows: rows.results,
  };
}

async function titleAwardsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT t.title, a.label AS award, link.ceremony_year AS year,
              link.outcome, link.source
       FROM title_awards AS link
       JOIN awards AS a ON a.award_id = link.award_id
       JOIN catalog_titles AS t ON t.id = link.title_id
       ORDER BY link.ceremony_year DESC, t.title
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["title", "award", "year", "outcome", "source"], rows: rows.results };
}

async function personAwardsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT p.name, a.label AS award, link.ceremony_year AS year, link.outcome
       FROM person_awards AS link
       JOIN awards AS a ON a.award_id = link.award_id
       JOIN catalog_people AS p ON p.person_id = link.person_id
       ORDER BY link.ceremony_year DESC, p.name
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["name", "award", "year", "outcome"], rows: rows.results };
}

async function letterboxdSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT t.title, t.year, e.letterboxd_id AS letterboxdId,
              e.rotten_tomatoes_id AS rottenTomatoesId, e.trakt_id AS traktId
       FROM catalog_title_external_ids AS e
       JOIN catalog_titles AS t ON t.id = e.title_id
       WHERE e.letterboxd_id IS NOT NULL
       ORDER BY t.popularity DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["title", "year", "letterboxdId", "rottenTomatoesId", "traktId"],
    rows: rows.results,
  };
}

async function visualFormatSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT t.title, t.year, f.kind, f.value, f.source
       FROM title_visual_format AS f
       JOIN catalog_titles AS t ON t.id = f.title_id
       ORDER BY t.popularity DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return { columns: ["title", "year", "kind", "value", "source"], rows: rows.results };
}

async function placesSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT t.title, tp.kind, p.label AS place, p.latitude, p.longitude, tp.source
       FROM catalog_title_places AS tp
       JOIN catalog_places AS p ON p.entity_id = tp.place_id
       JOIN catalog_titles AS t ON t.id = tp.title_id
       ORDER BY t.popularity DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["title", "kind", "place", "latitude", "longitude", "source"],
    rows: rows.results,
  };
}

async function adaptationsSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT t.title, w.label AS sourceWork, w.work_type AS workType,
              w.published_year AS published, link.source
       FROM title_source_works AS link
       JOIN source_works AS w ON w.work_id = link.work_id
       JOIN catalog_titles AS t ON t.id = link.title_id
       ORDER BY t.popularity DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["title", "sourceWork", "workType", "published", "source"],
    rows: rows.results,
  };
}

async function worldBoardSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT t.title, l.language, l.article, l.views,
              round(l.share * 100, 1) AS sharePercent
       FROM title_language_buzz AS l
       JOIN catalog_titles AS t ON t.id = l.title_id
       WHERE l.views > 0
       ORDER BY l.share DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["title", "language", "article", "views", "sharePercent"],
    rows: rows.results,
  };
}

const COUNT_SAMPLES: Record<string, (db: D1Database) => Promise<SampleResult>> = {
  titles: (db) => titleSample(db, "1 = 1"),
  movies: (db) => titleSample(db, "media_type = 'movie'"),
  shows: (db) => titleSample(db, "media_type = 'tv'"),
  posters: (db) => titleSample(db, "poster_key IS NOT NULL"),
  animeIds: (db) => titleSample(db, "mal_id IS NOT NULL"),
  animeDetails: (db) =>
    titleSample(
      db,
      "EXISTS (SELECT 1 FROM catalog_title_anime WHERE title_id = catalog_titles.id)",
    ),
  workingSet: (db) => workingSetSample(db, false),
  availabilityFresh: (db) => workingSetSample(db, true),
  embeddings: embeddingsSample,
  buzz: buzzSample,
  upcoming: upcomingSample,
  sections: sectionsSample,
  people: peopleSample,
  titleAwards: titleAwardsSample,
  personAwards: personAwardsSample,
  letterboxdIds: letterboxdSample,
  visualFormat: visualFormatSample,
  placedTitles: placesSample,
  adaptedTitles: adaptationsSample,
  worldBoards: worldBoardSample,
  seasons: seasonsSample,
  insights: insightsSample,
  revivalWorks: (db) => revivalSample(db, "1 = 1"),
  revivalApproved: (db) => revivalSample(db, "status = 'approved'"),
  revivalMirrored: (db) => revivalSample(db, "mirror_state = 'mirrored'"),
  revivalPending: (db) => revivalSample(db, "status = 'candidate'"),
  railSets: railsSample,
  pinnedShelves: pinnedShelvesSample,
  cinemas: (db) => cinemasSample(db, false),
  cinemasPlaced: (db) => cinemasSample(db, true),
  cinemaFilms: cinemaFilmsSample,
  screenings: screeningsSample,
  interestCells: interestCellsSample,
  users: usersSample,
  alertReady: alertReadySample,
  alertsSent: (db) => viewerAlertsSample(db, false),
  alertsWeek: (db) => viewerAlertsSample(db, true),
  signals: signalsSample,
  beliefs: beliefsSample,
};

async function tmdbSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, title, media_type AS mediaType, updated_at AS updatedAt
       FROM catalog_titles
       ORDER BY updated_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "mediaType", "updatedAt"],
    rows: rows.results,
  };
}

async function justwatchSample(db: D1Database): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT id, title, media_type AS mediaType, enriched_at AS enrichedAt
       FROM catalog_titles
       WHERE enriched_at IS NOT NULL
       ORDER BY enriched_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .all<SampleRow>();

  return {
    columns: ["id", "title", "mediaType", "enrichedAt"],
    rows: rows.results,
  };
}

async function enrichmentSourceSample(db: D1Database, source: string): Promise<SampleResult> {
  const rows = await db
    .prepare(
      `SELECT e.title_id AS id, t.title AS title, e.fetched_at AS fetchedAt,
              CASE e.miss WHEN 0 THEN 'hit' WHEN 1 THEN 'miss' ELSE 'pending' END AS status
       FROM title_enrichment AS e
       JOIN catalog_titles AS t ON t.id = e.title_id
       WHERE e.source = ?
       ORDER BY e.fetched_at DESC
       LIMIT ${SAMPLE_LIMIT}`,
    )
    .bind(source)
    .all<SampleRow>();

  return {
    columns: ["id", "title", "status", "fetchedAt"],
    rows: rows.results,
  };
}

const BUDGET_SAMPLES: Record<string, (db: D1Database) => Promise<SampleResult>> = {
  tmdb: tmdbSample,
  justwatch: justwatchSample,
  omdb: (db) => enrichmentSourceSample(db, "omdb"),
  mal: (db) => enrichmentSourceSample(db, "mal"),
  anilist: (db) => enrichmentSourceSample(db, "anilist"),
};

export async function readOverviewSample(
  env: Bindings,
  type: "count" | "budget",
  key: string,
): Promise<SampleResult | null> {
  const lookup = type === "count" ? COUNT_SAMPLES : BUDGET_SAMPLES;

  return (await lookup[key]?.(env.DB)) ?? null;
}

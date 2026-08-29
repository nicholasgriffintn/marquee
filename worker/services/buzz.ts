import type { MediaTitle, MediaType, TitleBuzz } from "../../src/domain/catalog.ts";
import { resolveEntities, type TitleEntity } from "../clients/wikidata.ts";
import {
  articleMatchesTitle,
  articleUrl,
  findArticle,
  getPageviews,
  WikimediaError,
} from "../clients/wikimedia.ts";
import { buzzScore, MIN_TRENDING_VIEWS } from "../lib/buzz.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { clamp, sum } from "../lib/numbers.ts";
import type { Bindings } from "../types.ts";
import { syncWorldBoard } from "./world-board.ts";

const SAMPLE_SIZE = 250;
const CONCURRENCY = 16;
const MAX_BOOST = 1.5;
const REFRESH_DAYS = 2;
const RETRY_DAYS = 21;
const SEARCH_BUDGET = 60;

type BuzzMatch = TitleBuzz["match"];

type SearchBudget = { remaining: number; blocked: boolean };

type Resolution =
  | { kind: "found"; article: string; match: BuzzMatch }
  | { kind: "absent" }
  | { kind: "skipped" };

type BuzzCandidate = {
  titleId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  mediaType: MediaType;
  tmdbId: number;
  article: string | null;
  match: BuzzMatch | null;
};

type BuzzRow = {
  titleId: string;
  article: string;
  match: BuzzMatch;
  views: number;
  previousViews: number;
};

type BuzzReadRow = {
  titleId: string;
  article: string;
  source: string;
  views: number;
  previousViews: number;
  delta: number;
  score: number;
  measuredAt: string;
};

function toBuzz(row: BuzzReadRow): TitleBuzz {
  return {
    article: row.article,
    articleUrl: articleUrl(row.article),
    match: row.source === "wikidata" ? "wikidata" : "search",
    views: row.views,
    previousViews: row.previousViews,
    delta: row.delta,
    score: row.score,
    measuredAt: row.measuredAt,
  };
}

async function candidates(env: Bindings) {
  const rows = await env.DB.query<{
    titleId: string;
    title: string;
    originalTitle: string | null;
    year: number | null;
    mediaType: MediaType;
    tmdbId: number;
    article: string | null;
    source: string | null;
  }>(
    `SELECT t.id AS "titleId", t.title, t.original_title AS "originalTitle", t.year,
            t.media_type AS "mediaType", t.tmdb_id AS "tmdbId", b.article, b.source
     FROM catalog_titles AS t
     LEFT JOIN title_buzz AS b ON b.title_id = t.id
     WHERE b.title_id IS NULL
        OR (b.article <> '' AND b.measured_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)))
        OR (b.article = '' AND b.measured_at < (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL)))
     ORDER BY t.popularity DESC
     LIMIT $3`,
    [`-${REFRESH_DAYS} days`, `-${RETRY_DAYS} days`, SAMPLE_SIZE],
  );

  return rows.rows.map((row): BuzzCandidate => ({
    titleId: row.titleId,
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.year,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    article: row.article || null,
    match: row.article ? (row.source === "wikidata" ? "wikidata" : "search") : null,
  }));
}

async function resolveArticle(
  candidate: BuzzCandidate,
  entities: Map<string, TitleEntity>,
  budget: SearchBudget,
): Promise<Resolution> {
  const names = [candidate.title, candidate.originalTitle];
  const entity = entities.get(candidate.titleId);

  if (entity?.article) {
    return { kind: "found", article: entity.article, match: "wikidata" };
  }

  if (candidate.article && candidate.match === "wikidata") {
    return { kind: "found", article: candidate.article, match: "wikidata" };
  }

  if (candidate.article && articleMatchesTitle(candidate.article, names)) {
    return { kind: "found", article: candidate.article, match: "search" };
  }

  if (budget.blocked || budget.remaining <= 0) {
    return { kind: "skipped" };
  }

  budget.remaining -= 1;

  try {
    const found = await findArticle(names, candidate.year, candidate.mediaType === "movie");

    return found ? { kind: "found", article: found, match: "search" } : { kind: "absent" };
  } catch (error) {
    if (error instanceof WikimediaError && error.status === 429) {
      budget.blocked = true;

      return { kind: "skipped" };
    }

    throw error;
  }
}

async function measure(
  candidate: BuzzCandidate,
  entities: Map<string, TitleEntity>,
  budget: SearchBudget,
): Promise<BuzzRow | null> {
  const resolved = await resolveArticle(candidate, entities, budget);

  if (resolved.kind === "skipped") {
    return null;
  }

  if (resolved.kind === "absent") {
    return {
      titleId: candidate.titleId,
      article: "",
      match: "search",
      views: 0,
      previousViews: 0,
    };
  }

  const { article, match } = resolved;
  const views = await getPageviews(article, 14);

  if (views.length < 8) {
    return {
      titleId: candidate.titleId,
      article,
      match,
      views: 0,
      previousViews: 0,
    };
  }

  const recent = sum(views.slice(-7));
  const previous = sum(views.slice(-14, -7));

  return {
    titleId: candidate.titleId,
    article,
    match,
    views: recent,
    previousViews: previous,
  };
}

async function storeEntityIds(env: Bindings, entities: Map<string, TitleEntity>) {
  const updates = [...entities];
  let written = 0;

  for (let index = 0; index < updates.length; index += 50) {
    // oxlint-disable-next-line no-await-in-loop
    written += await env.DB.transaction(async (transaction) => {
      let waveWritten = 0;

      for (const [titleId, entity] of updates.slice(index, index + 50)) {
        // oxlint-disable-next-line no-await-in-loop
        const result = await transaction.execute(
          `UPDATE catalog_titles SET wikidata_id = $1 WHERE id = $2 AND wikidata_id IS NULL`,
          [entity.entityId, titleId],
        );

        waveWritten += result.rowCount;
      }

      return waveWritten;
    });
  }

  return written;
}

export async function syncBuzz(env: Bindings) {
  const pending = await candidates(env);
  const unmatched = pending.filter((candidate) => candidate.match !== "wikidata");
  const entities = await resolveEntities(unmatched).catch(
    (error: unknown): Map<string, TitleEntity> => {
      logError("wikidata_lookup_failed", error);

      return new Map();
    },
  );
  const stored = await storeEntityIds(env, entities);
  const budget: SearchBudget = { remaining: SEARCH_BUDGET, blocked: false };
  const measured: BuzzRow[] = [];

  logEvent("buzz_entities_resolved", {
    candidates: pending.length,
    queried: unmatched.length,
    matched: entities.size,
    stored,
  });

  for (let index = 0; index < pending.length; index += CONCURRENCY) {
    const wave = pending.slice(index, index + CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(wave.map((entry) => measure(entry, entities, budget)));

    for (const result of settled) {
      if (result.status === "rejected") {
        logError("buzz_measure_failed", result.reason);
      } else if (result.value) {
        measured.push(result.value);
      }
    }
  }

  if (measured.length === 0) {
    return 0;
  }

  for (let index = 0; index < measured.length; index += 50) {
    // oxlint-disable-next-line no-await-in-loop
    await env.DB.transaction(async (transaction) => {
      for (const row of measured.slice(index, index + 50)) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO title_buzz
             (title_id, article, source, views, previous_views, delta, score, measured_at,
              world_views, world_previous_views, world_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9, $10)
           ON CONFLICT(title_id) DO UPDATE SET
             article = excluded.article,
             source = excluded.source,
             views = excluded.views,
             previous_views = excluded.previous_views,
             delta = excluded.delta,
             score = excluded.score,
             measured_at = CURRENT_TIMESTAMP,
             world_views = excluded.world_views,
             world_previous_views = excluded.world_previous_views,
             world_score = excluded.world_score`,
          [
            row.titleId,
            row.article,
            row.match,
            row.views,
            row.previousViews,
            (row.views - row.previousViews) / Math.max(1, row.previousViews),
            buzzScore(row.views, row.previousViews),
            row.views,
            row.previousViews,
            buzzScore(row.views, row.previousViews),
          ],
        );
      }
    });
  }

  const expanded = await syncWorldBoard(env).catch((error: unknown) => {
    logError("world_board_failed", error);

    return 0;
  });
  const resolved = measured.filter((row) => row.article !== "").length;

  logEvent("buzz_synced", {
    titles: measured.length,
    resolved,
    unresolved: measured.length - resolved,
    skipped: pending.length - measured.length,
    searchesLeft: budget.remaining,
    searchBlocked: budget.blocked,
    languageRows: expanded,
  });

  return resolved;
}

export async function buzzBoosts(env: Bindings, titleIds: string[]) {
  const unique = [...new Set(titleIds)].slice(0, 200);

  if (unique.length === 0) {
    return new Map<string, number>();
  }

  const rows = await env.DB.query<{ titleId: string; delta: number }>(
    `SELECT title_id AS "titleId", delta
     FROM title_buzz
     WHERE title_id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))`,
    [JSON.stringify(unique)],
  );

  return new Map(rows.rows.map((row) => [row.titleId, clamp(row.delta, 0, MAX_BOOST) * 0.15]));
}

export async function readBuzz(db: Database, titleIds: string[]) {
  const unique = [...new Set(titleIds)].slice(0, 400);

  if (unique.length === 0) {
    return new Map<string, TitleBuzz>();
  }

  const rows = await db.query<BuzzReadRow>(
    `SELECT title_id AS "titleId", article, source, views, previous_views AS "previousViews",
              delta, score, measured_at AS "measuredAt"
       FROM title_buzz
       WHERE article <> '' AND views > 0 AND title_id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))`,
    [JSON.stringify(unique)],
  );

  return new Map(rows.rows.map((row) => [row.titleId, toBuzz(row)]));
}

export function applyBuzz<Item extends MediaTitle>(items: Item[], buzz: Map<string, TitleBuzz>) {
  return items.map((item) => {
    const measured = buzz.get(item.id);

    return measured ? { ...item, buzz: measured } : item;
  });
}

export async function readTrendingBuzz(env: Bindings, limit = 20) {
  const rows = await env.DB.query<BuzzReadRow>(
    `SELECT b.title_id AS "titleId", b.article, b.source, b.views,
            b.previous_views AS "previousViews", b.delta, b.score, b.measured_at AS "measuredAt"
     FROM title_buzz AS b
     JOIN catalog_titles AS t ON t.id = b.title_id
     WHERE b.article <> '' AND b.views >= ${MIN_TRENDING_VIEWS}
       AND GREATEST(b.world_score, b.score) > 0
     ORDER BY GREATEST(b.world_score, b.score) DESC
     LIMIT $1`,
    [clamp(limit, 1, 60)],
  );

  return rows.rows.map((row) => ({ titleId: row.titleId, buzz: toBuzz(row) }));
}

export async function readTrending(env: Bindings, limit = 20) {
  const ranked = await readTrendingBuzz(env, limit);

  return ranked.map((entry) => entry.titleId);
}

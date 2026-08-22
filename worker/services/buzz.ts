import type { MediaTitle, TitleBuzz } from "../../src/domain/catalog.ts";
import { articlesForImdbIds } from "../clients/wikidata.ts";
import {
  articleMatchesTitle,
  articleUrl,
  findArticle,
  getPageviews,
} from "../clients/wikimedia.ts";
import { buzzScore, MIN_TRENDING_VIEWS } from "../lib/buzz.ts";
import { logError } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 250;
const CONCURRENCY = 6;
const MAX_BOOST = 1.5;
const REFRESH_DAYS = 2;
const RETRY_DAYS = 21;

type BuzzMatch = TitleBuzz["match"];

type BuzzCandidate = {
  titleId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  isFilm: boolean;
  imdbId: string | null;
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
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId, t.title, t.original_title AS originalTitle, t.year,
            t.media_type AS mediaType, t.imdb_id AS imdbId, b.article, b.source
     FROM catalog_titles AS t
     LEFT JOIN title_buzz AS b ON b.title_id = t.id
     WHERE b.title_id IS NULL
        OR (b.article <> '' AND b.measured_at < datetime('now', ?))
        OR (b.article = '' AND b.measured_at < datetime('now', ?))
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(`-${REFRESH_DAYS} days`, `-${RETRY_DAYS} days`, SAMPLE_SIZE)
    .all<{
      titleId: string;
      title: string;
      originalTitle: string | null;
      year: number | null;
      mediaType: string;
      imdbId: string | null;
      article: string | null;
      source: string | null;
    }>();

  return rows.results.map((row): BuzzCandidate => ({
    titleId: row.titleId,
    title: row.title,
    originalTitle: row.originalTitle,
    year: row.year,
    isFilm: row.mediaType === "movie",
    imdbId: row.imdbId,
    article: row.article || null,
    match: row.article ? (row.source === "wikidata" ? "wikidata" : "search") : null,
  }));
}

async function resolveArticle(candidate: BuzzCandidate, byImdb: Map<string, string>) {
  const names = [candidate.title, candidate.originalTitle];
  const exact = candidate.imdbId ? (byImdb.get(candidate.imdbId) ?? null) : null;

  if (exact) {
    return { article: exact, match: "wikidata" as const };
  }

  if (candidate.article && candidate.match === "wikidata") {
    return { article: candidate.article, match: "wikidata" as const };
  }

  if (candidate.article && articleMatchesTitle(candidate.article, names)) {
    return { article: candidate.article, match: "search" as const };
  }

  const found = await findArticle(names, candidate.year, candidate.isFilm);

  return found ? { article: found, match: "search" as const } : null;
}

async function measure(
  env: Bindings,
  candidate: BuzzCandidate,
  byImdb: Map<string, string>,
): Promise<BuzzRow> {
  const resolved = await resolveArticle(candidate, byImdb);

  if (!resolved) {
    return { titleId: candidate.titleId, article: "", match: "search", views: 0, previousViews: 0 };
  }

  const views = await getPageviews(resolved.article, 14);

  if (views.length < 8) {
    return { titleId: candidate.titleId, ...resolved, views: 0, previousViews: 0 };
  }

  const recent = views.slice(-7).reduce((total, value) => total + value, 0);
  const previous = views.slice(-14, -7).reduce((total, value) => total + value, 0);

  return { titleId: candidate.titleId, ...resolved, views: recent, previousViews: previous };
}

export async function syncBuzz(env: Bindings) {
  const pending = await candidates(env);
  const byImdb = await articlesForImdbIds(
    pending.flatMap((candidate) => (candidate.imdbId ? [candidate.imdbId] : [])),
  ).catch((error: unknown): Map<string, string> => {
    logError("wikidata_lookup_failed", error);

    return new Map();
  });
  const measured: BuzzRow[] = [];

  console.log(
    JSON.stringify({
      event: "buzz_articles_resolved",
      exact: byImdb.size,
      candidates: pending.length,
    }),
  );

  for (let index = 0; index < pending.length; index += CONCURRENCY) {
    const wave = pending.slice(index, index + CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(wave.map((entry) => measure(env, entry, byImdb)));

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
    await env.DB.batch(
      measured.slice(index, index + 50).map((row) =>
        env.DB.prepare(
          `INSERT INTO title_buzz
             (title_id, article, source, views, previous_views, delta, score, measured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id) DO UPDATE SET
             article = excluded.article,
             source = excluded.source,
             views = excluded.views,
             previous_views = excluded.previous_views,
             delta = excluded.delta,
             score = excluded.score,
             measured_at = CURRENT_TIMESTAMP`,
        ).bind(
          row.titleId,
          row.article,
          row.match,
          row.views,
          row.previousViews,
          (row.views - row.previousViews) / Math.max(1, row.previousViews),
          buzzScore(row.views, row.previousViews),
        ),
      ),
    );
  }

  const resolved = measured.filter((row) => row.article !== "").length;

  console.log(
    JSON.stringify({
      event: "buzz_synced",
      titles: measured.length,
      resolved,
      unresolved: measured.length - resolved,
    }),
  );

  return resolved;
}

export async function buzzBoosts(env: Bindings, titleIds: string[]) {
  const unique = [...new Set(titleIds)].slice(0, 200);

  if (unique.length === 0) {
    return new Map<string, number>();
  }

  const rows = await env.DB.prepare(
    `SELECT title_id AS titleId, delta
     FROM title_buzz
     WHERE title_id IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify(unique))
    .all<{ titleId: string; delta: number }>();

  return new Map(
    rows.results.map((row) => [row.titleId, Math.max(0, Math.min(MAX_BOOST, row.delta)) * 0.15]),
  );
}

export async function readBuzz(db: D1Database, titleIds: string[]) {
  const unique = [...new Set(titleIds)].slice(0, 400);

  if (unique.length === 0) {
    return new Map<string, TitleBuzz>();
  }

  const rows = await db
    .prepare(
      `SELECT title_id AS titleId, article, source, views, previous_views AS previousViews,
              delta, score, measured_at AS measuredAt
       FROM title_buzz
       WHERE article <> '' AND views > 0 AND title_id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(unique))
    .all<BuzzReadRow>();

  return new Map(rows.results.map((row) => [row.titleId, toBuzz(row)]));
}

export function applyBuzz<Item extends MediaTitle>(items: Item[], buzz: Map<string, TitleBuzz>) {
  return items.map((item) => {
    const measured = buzz.get(item.id);

    return measured ? { ...item, buzz: measured } : item;
  });
}

export async function readTrendingBuzz(env: Bindings, limit = 20) {
  const rows = await env.DB.prepare(
    `SELECT b.title_id AS titleId, b.article, b.source, b.views,
            b.previous_views AS previousViews, b.delta, b.score, b.measured_at AS measuredAt
     FROM title_buzz AS b
     JOIN catalog_titles AS t ON t.id = b.title_id
     WHERE b.article <> '' AND b.views >= ${MIN_TRENDING_VIEWS} AND b.score > 0
     ORDER BY b.score DESC
     LIMIT ?`,
  )
    .bind(Math.max(1, Math.min(60, limit)))
    .all<BuzzReadRow>();

  return rows.results.map((row) => ({ titleId: row.titleId, buzz: toBuzz(row) }));
}

export async function readTrending(env: Bindings, limit = 20) {
  const ranked = await readTrendingBuzz(env, limit);

  return ranked.map((entry) => entry.titleId);
}

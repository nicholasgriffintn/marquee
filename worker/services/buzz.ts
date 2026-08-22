import { articlesForImdbIds } from "../clients/wikidata.ts";
import { findArticle, getPageviews } from "../clients/wikimedia.ts";
import { logError } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 120;
const CONCURRENCY = 6;
const MAX_BOOST = 1.5;

type BuzzCandidate = {
  titleId: string;
  title: string;
  year: number | null;
  isFilm: boolean;
  imdbId: string | null;
};
type BuzzRow = { titleId: string; article: string; views: number; previousViews: number };

async function candidates(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT t.id AS titleId, t.title, t.year, t.media_type AS mediaType, t.imdb_id AS imdbId
     FROM catalog_titles AS t
     LEFT JOIN title_buzz AS b ON b.title_id = t.id
     WHERE b.title_id IS NULL OR b.measured_at < datetime('now', '-2 days')
     ORDER BY t.popularity DESC
     LIMIT ?`,
  )
    .bind(SAMPLE_SIZE)
    .all<{
      titleId: string;
      title: string;
      year: number | null;
      mediaType: string;
      imdbId: string | null;
    }>();

  return rows.results.map((row): BuzzCandidate => ({
    titleId: row.titleId,
    title: row.title,
    year: row.year,
    isFilm: row.mediaType === "movie",
    imdbId: row.imdbId,
  }));
}

async function measure(
  env: Bindings,
  candidate: BuzzCandidate,
  byImdb: Map<string, string>,
): Promise<BuzzRow | null> {
  const existing = await env.DB.prepare(`SELECT article FROM title_buzz WHERE title_id = ?`)
    .bind(candidate.titleId)
    .first<{ article: string }>();
  const article =
    existing?.article ??
    (candidate.imdbId ? byImdb.get(candidate.imdbId) : null) ??
    (await findArticle(candidate.title, candidate.year, candidate.isFilm));

  if (!article) {
    return null;
  }

  const views = await getPageviews(article, 14);

  if (views.length < 8) {
    return null;
  }

  const recent = views.slice(-7).reduce((total, value) => total + value, 0);
  const previous = views.slice(-14, -7).reduce((total, value) => total + value, 0);

  return { titleId: candidate.titleId, article, views: recent, previousViews: previous };
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
          `INSERT INTO title_buzz (title_id, article, views, previous_views, delta, measured_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id) DO UPDATE SET
             article = excluded.article,
             views = excluded.views,
             previous_views = excluded.previous_views,
             delta = excluded.delta,
             measured_at = CURRENT_TIMESTAMP`,
        ).bind(
          row.titleId,
          row.article,
          row.views,
          row.previousViews,
          (row.views - row.previousViews) / Math.max(1, row.previousViews),
        ),
      ),
    );
  }

  console.log(JSON.stringify({ event: "buzz_synced", titles: measured.length }));

  return measured.length;
}

export async function buzzBoosts(env: Bindings, titleIds: string[]) {
  const unique = [...new Set(titleIds)].slice(0, 200);

  if (unique.length === 0) {
    return new Map<string, number>();
  }

  const rows = await env.DB.prepare(
    `SELECT title_id AS titleId, delta
     FROM title_buzz
     WHERE title_id IN (${unique.map(() => "?").join(", ")})`,
  )
    .bind(...unique)
    .all<{ titleId: string; delta: number }>();

  return new Map(
    rows.results.map((row) => [row.titleId, Math.max(0, Math.min(MAX_BOOST, row.delta)) * 0.15]),
  );
}

export async function readTrending(env: Bindings, limit = 20) {
  const rows = await env.DB.prepare(
    `SELECT b.title_id AS titleId
     FROM title_buzz AS b
     JOIN catalog_titles AS t ON t.id = b.title_id
     WHERE b.views >= 500
     ORDER BY b.delta DESC
     LIMIT ?`,
  )
    .bind(Math.max(1, Math.min(60, limit)))
    .all<{ titleId: string }>();

  return rows.results.map((row) => row.titleId);
}

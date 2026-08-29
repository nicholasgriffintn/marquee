import type { DiaryRow } from "../../src/lib/letterboxd.ts";
import { logError } from "../lib/logging.ts";
import { searchCatalogue } from "../repositories/catalog-search.ts";
import type { Bindings, IngestionJob } from "../types.ts";

const MATCH_CANDIDATES = 6;
const QUEUE_CAP = 100;

export type ImportOutcome = { matched: number; queued: number; titleIds: string[] };

function normalise(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

async function matchRow(db: Database, row: DiaryRow) {
  const candidates = await searchCatalogue(db, {
    query: row.name,
    scope: "title",
    mediaType: "movie",
    limit: MATCH_CANDIDATES,
    matchAny: false,
  });

  if (candidates.length === 0) {
    return null;
  }

  const wanted = normalise(row.name);
  const exact = candidates.filter(
    (title) => normalise(title.title) === wanted || normalise(title.originalTitle) === wanted,
  );
  const pool = exact.length ? exact : candidates;

  const year = row.year;

  if (year) {
    const sameYear = pool.find((title) => title.year && Math.abs(title.year - year) <= 1);

    if (sameYear) {
      return sameYear.id;
    }
  }

  return exact.length ? exact[0].id : null;
}

export async function importDiary(
  env: Bindings,
  viewerId: string,
  rows: DiaryRow[],
): Promise<ImportOutcome> {
  const matched: { titleId: string; rating: number | null; watchedAt: string }[] = [];
  const titleIds: string[] = [];
  const unmatched: DiaryRow[] = [];

  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop
    const titleId = await matchRow(env.DB, row).catch(() => null);

    if (!titleId) {
      unmatched.push(row);

      continue;
    }

    titleIds.push(titleId);
    matched.push({
      titleId,
      rating: row.rating,
      watchedAt: row.watchedAt ? `${row.watchedAt} 12:00:00` : new Date().toISOString(),
    });
  }

  if (matched.length) {
    try {
      await env.DB.transaction(async (transaction) => {
        for (const entry of matched) {
          await transaction.execute(
            `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts, updated_at)
         VALUES ($1, $2, $3, 'watched', $4, '', $5)
         ON CONFLICT(viewer_id, title_id) DO UPDATE SET
           status = 'watched',
           rating = COALESCE(excluded.rating, viewing_entries.rating),
           updated_at = excluded.updated_at`,
            [crypto.randomUUID(), viewerId, entry.titleId, entry.rating, entry.watchedAt],
          );
        }
      });
    } catch (error) {
      logError("letterboxd_import_failed", error);

      return { matched: 0, queued: 0, titleIds: [] };
    }
  }

  const queued = await queueUnmatched(env, viewerId, unmatched);

  return { matched: titleIds.length, queued, titleIds };
}

async function queueUnmatched(env: Bindings, viewerId: string, rows: DiaryRow[]) {
  if (rows.length === 0 || !env.INGESTION_QUEUE) {
    return 0;
  }

  try {
    await env.INGESTION_QUEUE.sendBatch(
      rows.slice(0, QUEUE_CAP).map((row) => ({
        body: {
          type: "import-diary-row",
          viewerId,
          name: row.name,
          year: row.year,
          rating: row.rating,
          watchedAt: row.watchedAt,
        } satisfies IngestionJob,
      })),
    );

    return Math.min(rows.length, QUEUE_CAP);
  } catch (error) {
    logError("letterboxd_queue_failed", error);

    return 0;
  }
}

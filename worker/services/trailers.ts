import type { TrailerCard, TrailerSort } from "../../src/domain/trailers.ts";
import { parseDatabaseDate } from "../../src/lib/dates.ts";
import {
  getKinoCheckTrailers,
  KINOCHECK_PAGE_SIZE,
  type KinoCheckFeed,
  type KinoCheckTrailer,
} from "../clients/kinocheck.ts";
import { getItems } from "../clients/tmdb.ts";
import { withRateLimitPause } from "../jobs/sources.ts";
import { withKvCache } from "../lib/cache.ts";
import { logEvent } from "../lib/logging.ts";
import { claimBudget, readBudgetRoom } from "../repositories/budgets.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { storeItems } from "../repositories/catalog-writer.ts";
import {
  readKnownTitleIds,
  readRecentTrailers,
  writeTrailerRows,
} from "../repositories/trailers.ts";
import type { Bindings } from "../types.ts";

const FEED_PAGES: Record<KinoCheckFeed, number> = { latest: 3, trending: 1 };
const HYDRATE_LIMIT = 40;
const TMDB_RESERVE = 5_000;
const TRAILERS_CACHE_SECONDS = 600;

async function collectTrailers(env: Bindings) {
  const found = new Map<string, KinoCheckTrailer>();
  let calls = 0;

  for (const [feed, pages] of Object.entries(FEED_PAGES) as [KinoCheckFeed, number][]) {
    for (let page = 1; page <= pages; page += 1) {
      // oxlint-disable-next-line no-await-in-loop
      if (!(await claimBudget(env, "kinocheck"))) {
        logEvent("budget_exhausted", { source: "kinocheck", feed, page });

        return { found, calls };
      }

      // oxlint-disable-next-line no-await-in-loop
      const attempt = await withRateLimitPause(env, "kinocheck", () =>
        getKinoCheckTrailers(env, feed, page),
      );

      calls += 1;

      if (attempt.limited) {
        return { found, calls };
      }

      for (const trailer of attempt.value) {
        const id = `${trailer.titleId}:${trailer.key}`;
        const previous = found.get(id);

        if (!previous || previous.views < trailer.views) {
          found.set(id, trailer);
        }
      }

      if (attempt.value.length < KINOCHECK_PAGE_SIZE) {
        break;
      }
    }
  }

  return { found, calls };
}

async function hydrateMissing(env: Bindings, missing: string[]) {
  if (missing.length === 0) {
    return [];
  }

  const room = (await readBudgetRoom(env, "tmdb")) - TMDB_RESERVE;
  const wanted = missing.slice(0, Math.max(0, Math.min(HYDRATE_LIMIT, room)));

  if (wanted.length === 0) {
    logEvent("trailers_hydrate_skipped", { missing: missing.length });

    return [];
  }

  const titles = await getItems(env, wanted);

  await storeItems(env.DB, titles, new Date().toISOString());

  return titles.map((title) => title.id);
}

export async function syncTrailers(env: Bindings) {
  const { found, calls } = await collectTrailers(env);
  const trailers = [...found.values()];
  const titleIds = [...new Set(trailers.map((trailer) => trailer.titleId))];
  const known = await readKnownTitleIds(env.DB, titleIds);
  const missing = titleIds.filter((titleId) => !known.has(titleId));
  const hydrated = await hydrateMissing(env, missing);

  for (const titleId of hydrated) {
    known.add(titleId);
  }

  const rows = trailers.filter((trailer) => known.has(trailer.titleId));

  await writeTrailerRows(env.DB, rows);

  logEvent("trailers_synced", {
    calls,
    found: trailers.length,
    written: rows.length,
    hydrated: hydrated.length,
    unresolved: missing.length - hydrated.length,
  });
}

async function buildTrailers(env: Bindings, sort: TrailerSort, limit: number) {
  const rows = await readRecentTrailers(env.DB, sort, limit);
  const items = await readItems(
    env.DB,
    rows.map((row) => row.titleId),
    limit,
  );
  const byId = new Map(items.map((item) => [item.id, item]));

  return rows.flatMap((row): TrailerCard[] => {
    const item = byId.get(row.titleId);

    return item
      ? [
          {
            key: row.key,
            name: row.name,
            type: row.type,
            source: row.source,
            views: row.views ?? null,
            publishedAt: parseDatabaseDate(row.publishedAt)?.toISOString() ?? row.publishedAt,
            item,
          },
        ]
      : [];
  });
}

export function getLatestTrailers(env: Bindings, sort: TrailerSort, limit: number) {
  return withKvCache(env, `catalog-trailers-${sort}-${limit}`, TRAILERS_CACHE_SECONDS, () =>
    buildTrailers(env, sort, limit),
  );
}

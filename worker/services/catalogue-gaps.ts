import type { MediaTitle } from "../../src/domain/catalog.ts";
import { searchOmdb, type OmdbSearchResult } from "../clients/omdb.ts";
import { withSourceBudget } from "../jobs/sources.ts";
import { readCachedValue, writeCachedValue } from "../lib/cache.ts";
import {
  GAP_DISCOVERY,
  gapQueryKey,
  hasAdequateResults,
  hasTitleIntent,
} from "../lib/catalogue-gaps.ts";
import { logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import { imdbIdFrom } from "../lib/text.ts";
import { readBudgetRoom } from "../repositories/budgets.ts";
import {
  claimGapLookup,
  claimGapTitles,
  countRecentGapTitles,
  readCatalogueImdbIds,
} from "../repositories/catalogue-gaps.ts";
import type { Bindings, IngestionJob } from "../types.ts";

const CANDIDATE_TARGET = GAP_DISCOVERY.queuePerLookup * 2;

function pendingTitle(result: OmdbSearchResult): MediaTitle {
  return {
    id: `imdb:${result.imdbId}`,
    tmdbId: 0,
    mediaType: result.mediaType,
    title: result.title,
    originalTitle: result.title,
    overview: "",
    releaseDate: null,
    year: result.year,
    runtimeMinutes: null,
    numberOfSeasons: null,
    genres: [],
    certification: null,
    tmdbScore: null,
    tmdbVoteCount: 0,
    popularity: 0,
    posterUrl: result.posterUrl,
    backdropUrl: null,
    providers: [],
    watchLink: null,
    tmdbUrl: `https://www.imdb.com/title/${result.imdbId}/`,
    imdbUrl: `https://www.imdb.com/title/${result.imdbId}/`,
    pending: true,
  };
}

async function searchUpstream(env: Bindings, query: string) {
  const found = new Map<string, OmdbSearchResult>();

  for (let page = 1; page <= GAP_DISCOVERY.searchPages; page += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const results = await withSourceBudget(
      env,
      "omdb",
      () => searchOmdb(env, query, { page }),
      GAP_DISCOVERY.budgetReserve,
    );

    if (!results) {
      break;
    }

    for (const result of results) {
      found.set(result.imdbId, result);
    }

    if (results.length < GAP_DISCOVERY.searchPageSize || found.size >= CANDIDATE_TARGET) {
      break;
    }
  }

  return [...found.values()];
}

async function heldImdbIds(db: D1Database, results: OmdbSearchResult[], known: MediaTitle[]) {
  const held = await readCatalogueImdbIds(
    db,
    results.map((result) => result.imdbId),
  );

  for (const title of known) {
    const imdbId = imdbIdFrom(title.imdbUrl);

    if (imdbId) {
      held.add(imdbId);
    }
  }

  return held;
}

async function queueRoom(db: D1Database) {
  const queued = await countRecentGapTitles(db, 1);

  return Math.min(GAP_DISCOVERY.queuePerLookup, GAP_DISCOVERY.queuePerHour - queued);
}

async function discoverGap(env: Bindings, query: string, queryKey: string, known: MediaTitle[]) {
  const room = await queueRoom(env.DB);

  if (room <= 0) {
    logEvent("catalogue_gap_capped", { queryKey });

    return [];
  }

  if ((await readBudgetRoom(env, "omdb")) <= GAP_DISCOVERY.budgetReserve) {
    return [];
  }

  if (!(await claimGapLookup(env.DB, queryKey, GAP_DISCOVERY.lookupCooldownHours))) {
    return [];
  }

  const results = await searchUpstream(env, query);
  const held = await heldImdbIds(env.DB, results, known);
  const candidates = results.filter((result) => !held.has(result.imdbId)).slice(0, room);
  const claimed = new Set(
    await claimGapTitles(
      env.DB,
      candidates.map((result) => result.imdbId),
      GAP_DISCOVERY.titleCooldownDays,
    ),
  );
  const queued = candidates.filter((result) => claimed.has(result.imdbId));

  await enqueue(
    env.INGESTION_QUEUE,
    queued.map((result): IngestionJob => ({ type: "import-imdb-title", imdbId: result.imdbId })),
  );

  logEvent("catalogue_gap_discovered", {
    queryKey,
    candidates: results.length,
    queued: queued.length,
  });

  return queued.map(pendingTitle);
}

export async function findGapTitles(env: Bindings, query: string, known: MediaTitle[]) {
  if (!env.OMDB_API_KEY || !hasTitleIntent(query) || hasAdequateResults(query, known)) {
    return [];
  }

  const queryKey = gapQueryKey(query);
  const cacheKey = `catalogue-gap:${queryKey}`;
  const cached = await readCachedValue<MediaTitle[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = await discoverGap(env, query, queryKey, known);

  await writeCachedValue(cacheKey, pending, GAP_DISCOVERY.resultCacheSeconds);

  return pending;
}

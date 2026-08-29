import type { MediaTitle } from "../../src/domain/catalog.ts";
import { searchOmdb, type OmdbSearchResult } from "../clients/omdb.ts";
import { withSourceBudget } from "../jobs/sources.ts";
import { readCachedValue, writeCachedValue } from "../lib/cache.ts";
import type { Bindings, IngestionJob } from "../types.ts";

const PENDING_LIMIT = 12;
const SEARCH_PAGES = 2;
const PAGE_SIZE = 10;
const LOCAL_ENOUGH = 8;
const SEARCH_RESERVE = 1_000;
const SEARCH_CACHE_SECONDS = 6 * 3_600;

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

async function searchPages(env: Bindings, query: string) {
  const cacheKey = `omdb-search:${query.trim().toLowerCase()}`;
  const cached = await readCachedValue<OmdbSearchResult[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const found = new Map<string, OmdbSearchResult>();
  let answered = false;

  for (let page = 1; page <= SEARCH_PAGES; page += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const results = await withSourceBudget(
      env,
      "omdb",
      () => searchOmdb(env, query, { page }),
      SEARCH_RESERVE,
    );

    if (!results) {
      break;
    }

    answered = true;

    for (const result of results) {
      found.set(result.imdbId, result);
    }

    if (results.length < PAGE_SIZE || found.size >= PENDING_LIMIT) {
      break;
    }
  }

  const results = [...found.values()];

  if (answered) {
    await writeCachedValue(cacheKey, results, SEARCH_CACHE_SECONDS);
  }

  return results;
}

export async function findPendingTitles(env: Bindings, query: string, known: MediaTitle[]) {
  if (!env.OMDB_API_KEY || !query || known.length >= LOCAL_ENOUGH) {
    return [];
  }

  const results = await searchPages(env, query);

  if (results.length === 0) {
    return [];
  }

  const imdbIds = results.map((result) => result.imdbId);
  const placeholders = imdbIds.map(() => "?").join(", ");
  const existing = await env.DB.prepare(
    `SELECT imdb_id AS imdbId FROM catalog_titles WHERE imdb_id IN (${placeholders})`,
  )
    .bind(...imdbIds)
    .all<{ imdbId: string }>();
  const held = new Set(existing.results.map((row) => row.imdbId));

  for (const title of known) {
    const match = title.imdbUrl ? /\/(tt\d+)/u.exec(title.imdbUrl)?.[1] : null;

    if (match) {
      held.add(match);
    }
  }

  const missing = results.filter((result) => !held.has(result.imdbId)).slice(0, PENDING_LIMIT);

  if (missing.length === 0) {
    return [];
  }

  await env.INGESTION_QUEUE.sendBatch(
    missing.map((result) => ({
      body: { type: "import-imdb-title", imdbId: result.imdbId } satisfies IngestionJob,
      contentType: "json" as const,
    })),
  );

  return missing.map(pendingTitle);
}

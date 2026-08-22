import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { readBudgets } from "../repositories/budgets.ts";
import { readAvailability, readCatalog, readItems } from "../repositories/catalog-reader.ts";
import {
  readGenres,
  readKeywords,
  readRanked,
  searchCatalogue as queryCatalogue,
  searchTitlesFirst,
} from "../repositories/catalog-search.ts";
import { readProviders } from "../repositories/providers.ts";
import type { Bindings } from "../types.ts";
import { readTrending } from "./buzz.ts";
import { findPendingTitles } from "./discovery.ts";
import { readTonight } from "./schedule.ts";
import { traktUpcoming } from "./trakt.ts";

export async function getCatalogue(env: Bindings, providerIds: string[]) {
  return readCatalog(env.DB, "", providerIds);
}

export async function searchCatalogue(env: Bindings, query: string, providerIds: string[]) {
  const catalogue = await readCatalog(env.DB, query, providerIds);
  const items = catalogue?.sections[0]?.items ?? [];
  let pending: MediaTitle[] = [];

  try {
    pending = await findPendingTitles(env, query, items);
  } catch (error) {
    logError("pending_lookup_failed", error, { area: "search" });
  }

  return {
    items: [...items, ...pending],
    query,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCatalogueItems(db: D1Database, ids: string[]) {
  return {
    items: await readItems(db, ids),
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getProviderCatalogue(db: D1Database) {
  return readProviders(db);
}

export async function getTitleAvailability(db: D1Database, titleId: string) {
  const providers = await readAvailability(db, titleId);

  return providers
    ? {
        providers,
        source: "Marquee catalogue",
        fetchedAt: new Date().toISOString(),
      }
    : null;
}

export type BrowseQuery = {
  mediaType?: "movie" | "tv";
  genres: string[];
  keywords: string[];
  providerIds: string[];
  query: string;
  sort: "popularity" | "score" | "recent";
  page: number;
};

const PAGE_SIZE = 24;
const BROWSE_MIN_VOTES = 20;

export async function browseCatalogue(env: Bindings, browse: BrowseQuery) {
  const search = {
    mediaType: browse.mediaType,
    genres: browse.genres,
    keywords: browse.keywords,
    providerIds: browse.providerIds,
    query: browse.query,
    sort: browse.query && browse.sort === "popularity" ? undefined : browse.sort,
    minVotes: browse.sort === "recent" ? 0 : BROWSE_MIN_VOTES,
    limit: PAGE_SIZE + 1,
    offset: browse.page * PAGE_SIZE,
  };
  const items = browse.query
    ? await searchTitlesFirst(env.DB, search)
    : await queryCatalogue(env.DB, search);

  return {
    items: items.slice(0, PAGE_SIZE),
    hasMore: items.length > PAGE_SIZE,
    page: browse.page,
  };
}

export async function getGenres(env: Bindings) {
  return readGenres(env.DB);
}

export async function getKeywords(env: Bindings) {
  return readKeywords(env.DB);
}

export async function getTonight(env: Bindings, viewerId: string | null, origin: string) {
  const scheduled = await readTonight(env, viewerId);

  if (!viewerId) {
    return { episodes: scheduled, fetchedAt: new Date().toISOString() };
  }

  const seen = new Set(
    scheduled.map((episode) => `${episode.showName}|${episode.airsAt.slice(0, 10)}`),
  );
  const calendar = await traktUpcoming(env, viewerId, origin);
  const extra = calendar
    .filter((episode) => !seen.has(`${episode.showName}|${episode.airsAt.slice(0, 10)}`))
    .map((episode) => ({
      titleId: episode.tmdbId ? `tv:${episode.tmdbId}` : null,
      showName: episode.showName,
      season: episode.season,
      episode: episode.episode,
      episodeName: episode.episodeName,
      airsAt: episode.airsAt,
      network: null,
      item: null,
    }));
  const merged = [...scheduled, ...extra].filter(
    (episode) => Date.parse(episode.airsAt) < Date.now() + 36 * 3_600_000,
  );

  merged.sort((left, right) => Date.parse(left.airsAt) - Date.parse(right.airsAt));

  const hydrated = await readRanked(
    env.DB,
    merged.flatMap((episode) => (episode.titleId && !episode.item ? [episode.titleId] : [])),
  );
  const byId = new Map(hydrated.map((item) => [item.id, item]));

  return {
    episodes: merged.map((episode) => ({
      ...episode,
      item: episode.item ?? (episode.titleId ? (byId.get(episode.titleId) ?? null) : null),
    })),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getTrending(env: Bindings) {
  const titleIds = await readTrending(env);

  return {
    items: await readRanked(env.DB, titleIds),
    source: "Wikipedia pageview trend",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getPipelineHealth(env: Bindings) {
  const [failures, lastRuns, budgets] = await Promise.all([
    env.DB.prepare(
      `SELECT job_type AS jobType, subject_id AS subjectId, error, started_at AS startedAt
       FROM ingestion_runs
       WHERE status = 'failed'
       ORDER BY started_at DESC
       LIMIT 12`,
    ).all<{ jobType: string; subjectId: string | null; error: string | null; startedAt: string }>(),
    env.DB.prepare(
      `SELECT job_type AS jobType, max(started_at) AS lastRunAt, count(*) AS runs
       FROM ingestion_runs
       WHERE status = 'completed'
       GROUP BY job_type
       ORDER BY lastRunAt DESC
       LIMIT 12`,
    ).all<{ jobType: string; lastRunAt: string; runs: number }>(),
    readBudgets(env),
  ]);

  return {
    failures: failures.results,
    lastRuns: lastRuns.results,
    budgets,
    fetchedAt: new Date().toISOString(),
  };
}

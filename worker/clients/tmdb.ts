import type {
  CatalogResponse,
  CatalogSection,
  MediaTitle,
  MediaType,
} from "../../src/domain/catalog.ts";
import {
  parseTmdbProviders,
  parseTmdbSummaries,
  parseTmdbTitle,
  type TmdbSummary,
} from "../lib/tmdb-payload.ts";
import { isRecord, numberAt, records } from "../lib/values.ts";
import type { Bindings } from "../types.ts";

const API_BASE = "https://api.themoviedb.org/3";
const PROVIDER_REGION = "GB";
const HYDRATE_BATCH = 12;

export const TMDB_MAX_PAGES = 500;
export const TMDB_PAGE_SIZE = 20;

export async function getItems(env: Bindings, ids: string[]) {
  const summaries = ids.flatMap((id): TmdbSummary[] => {
    const match = /^(movie|tv):(\d+)$/u.exec(id);

    return match
      ? [{ mediaType: match[1] === "movie" ? "movie" : "tv", id: Number(match[2]) }]
      : [];
  });

  return hydrateTitles(env, summaries);
}

export async function getTmdbProviders(env: Bindings) {
  const [movies, television] = await Promise.all([
    requestTmdb(env, "/watch/providers/movie", { watch_region: PROVIDER_REGION }),
    requestTmdb(env, "/watch/providers/tv", { watch_region: PROVIDER_REGION }),
  ]);
  const providers = new Map<number, ReturnType<typeof parseTmdbProviders>[number]>();

  for (const provider of [...parseTmdbProviders(movies), ...parseTmdbProviders(television)]) {
    const existing = providers.get(provider.id);

    if (!existing || provider.displayPriority < existing.displayPriority) {
      providers.set(provider.id, provider);
    }
  }

  // The project targets ES2022, before Array.prototype.toSorted.
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...providers.values()].sort(
    (left, right) =>
      left.displayPriority - right.displayPriority || left.name.localeCompare(right.name),
  );
}

async function hydrateTitles(env: Bindings, summaries: TmdbSummary[]) {
  const uniqueSummaries = [
    ...new Map(
      summaries.map((summary) => [`${summary.mediaType}:${summary.id}`, summary]),
    ).values(),
  ];
  const titles: MediaTitle[] = [];

  for (let index = 0; index < uniqueSummaries.length; index += HYDRATE_BATCH) {
    const wave = uniqueSummaries.slice(index, index + HYDRATE_BATCH);
    // oxlint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(wave.map((summary) => getTitleDetails(env, summary)));

    titles.push(
      ...settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
    );
  }

  return titles;
}

export type DiscoverWindow = { startDate: string; endDate: string };

function windowParameters(mediaType: MediaType, window: DiscoverWindow | null) {
  if (!window) {
    return {};
  }

  const field = mediaType === "movie" ? "primary_release_date" : "first_air_date";

  return { [`${field}.gte`]: window.startDate, [`${field}.lte`]: window.endDate };
}

function discoverParameters(mediaType: MediaType, window: DiscoverWindow | null, page: number) {
  return {
    include_adult: "false",
    include_video: "false",
    page: String(page),
    sort_by: "popularity.desc",
    ...windowParameters(mediaType, window),
  };
}

export async function measureDiscoverWindow(
  env: Bindings,
  mediaType: MediaType,
  window: DiscoverWindow | null,
) {
  const response = await requestTmdb(
    env,
    `/discover/${mediaType}`,
    discoverParameters(mediaType, window, 1),
  );
  const totalResults = isRecord(response) ? Number(response.total_results) : 0;
  const totalPages = isRecord(response) ? Number(response.total_pages) : 0;

  return {
    totalResults: Number.isFinite(totalResults) ? Math.max(0, Math.trunc(totalResults)) : 0,
    totalPages: Number.isFinite(totalPages) ? Math.max(0, Math.trunc(totalPages)) : 0,
  };
}

export async function getDiscoverPage(
  env: Bindings,
  mediaType: MediaType,
  page: number,
  window: DiscoverWindow | null = null,
) {
  const response = await requestTmdb(
    env,
    `/discover/${mediaType}`,
    discoverParameters(mediaType, window, Math.min(Math.max(1, page), TMDB_MAX_PAGES)),
  );
  const summaries = parseTmdbSummaries(response, mediaType);

  return hydrateTitles(env, summaries);
}

async function getTitleDetails(env: Bindings, summary: TmdbSummary) {
  const append =
    summary.mediaType === "movie"
      ? "watch/providers,release_dates,external_ids,keywords,credits,videos,recommendations"
      : "watch/providers,content_ratings,external_ids,keywords,aggregate_credits,videos,recommendations";
  const payload = await requestTmdb(env, `/${summary.mediaType}/${summary.id}`, {
    append_to_response: append,
  });
  const title = parseTmdbTitle(summary.mediaType, payload);

  if (!title) {
    throw new TmdbError("TMDB returned an incomplete title");
  }

  return title;
}

async function requestTmdb(env: Bindings, path: string, parameters: Record<string, string> = {}) {
  if (!env.TMDB_API_TOKEN) {
    throw new TmdbError("TMDB is not configured", 503);
  }

  const url = new URL(`${API_BASE}${path}`);

  url.search = new URLSearchParams(parameters).toString();

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${env.TMDB_API_TOKEN}`,
    },
    signal: AbortSignal.timeout(12_000),
    cf: {
      cacheEverything: true,
      cacheTtl: path.startsWith("/watch/providers") ? 21_600 : 900,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new TmdbError("TMDB rate limited the request", 429);
    }

    throw new TmdbError(
      response.status === 401 ? "TMDB credentials were rejected" : "TMDB request failed",
      response.status === 401 ? 503 : 502,
    );
  }

  return response.json();
}

function providerParameters(providerIds: string[]): Record<string, string> {
  return providerIds.length
    ? {
        watch_region: PROVIDER_REGION,
        with_watch_providers: providerIds.join("|"),
        with_watch_monetization_types: "flatrate|free|ads|rent|buy",
      }
    : {};
}

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export async function getCatalog(
  env: Bindings,
  query: string,
  providerIds: string[],
): Promise<CatalogResponse> {
  const fetchedAt = new Date().toISOString();

  if (query) {
    const response = await requestTmdb(env, "/search/multi", {
      query,
      include_adult: "false",
    });
    const items = await hydrateTitles(env, parseTmdbSummaries(response));

    return {
      sections: [
        {
          id: "search",
          title: "Search results",
          description: `Results from TMDB for “${query}”`,
          items,
        },
      ],
      source: "TMDB",
      availabilitySource: "JustWatch via TMDB",
      fetchedAt,
    };
  }

  const providerFilters = providerParameters(providerIds);
  const [trending, movies, television] = await Promise.all([
    providerIds.length ? Promise.resolve(null) : requestTmdb(env, "/trending/all/week"),
    requestTmdb(env, "/discover/movie", {
      include_adult: "false",
      sort_by: "popularity.desc",
      ...providerFilters,
    }),
    requestTmdb(env, "/discover/tv", {
      include_adult: "false",
      sort_by: "popularity.desc",
      ...providerFilters,
    }),
  ]);
  const sectionDefinitions = [
    ...(trending
      ? [
          {
            id: "trending",
            title: "Trending on TMDB",
            description: "TMDB trending titles this week",
            summaries: parseTmdbSummaries(trending),
          },
        ]
      : []),
    {
      id: "movies",
      title: providerIds.length ? "Movies on your services" : "Popular movies",
      description: providerIds.length
        ? "GB availability supplied by JustWatch via TMDB"
        : "Popular movies on TMDB",
      summaries: parseTmdbSummaries(movies, "movie"),
    },
    {
      id: "television",
      title: providerIds.length ? "TV on your services" : "Popular television",
      description: providerIds.length
        ? "GB availability supplied by JustWatch via TMDB"
        : "Popular television on TMDB",
      summaries: parseTmdbSummaries(television, "tv"),
    },
  ];
  const titles = await hydrateTitles(
    env,
    sectionDefinitions.flatMap((section) => section.summaries),
  );
  const titlesById = new Map(titles.map((title) => [title.id, title]));
  const sections: CatalogSection[] = sectionDefinitions.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    items: section.summaries
      .map((summary) => titlesById.get(`${summary.mediaType}:${summary.id}`))
      .filter((title): title is MediaTitle => Boolean(title)),
  }));

  return {
    sections,
    source: "TMDB",
    availabilitySource: "JustWatch via TMDB",
    fetchedAt,
  };
}

export async function findByTitle(env: Bindings, name: string, year: number | null) {
  const response = await requestTmdb(env, "/search/movie", {
    query: name.slice(0, 120),
    ...(year ? { primary_release_year: String(year) } : {}),
  });

  if (!isRecord(response)) {
    return null;
  }

  const [match] = records(response.results);
  const tmdbId = match ? numberAt(match, "id") : null;

  return tmdbId ? `movie:${tmdbId}` : null;
}

export async function findByImdbId(env: Bindings, imdbId: string) {
  const response = await requestTmdb(env, `/find/${imdbId}`, { external_source: "imdb_id" });

  if (!isRecord(response)) {
    return null;
  }

  const movie = records(response.movie_results)[0];
  const television = records(response.tv_results)[0];
  const mediaType: MediaType | null = movie ? "movie" : television ? "tv" : null;
  const tmdbId = numberAt(movie ?? television ?? {}, "id");

  return mediaType && tmdbId ? `${mediaType}:${tmdbId}` : null;
}

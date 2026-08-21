import type { CatalogResponse, CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import {
  parseTmdbProviders,
  parseTmdbSummaries,
  parseTmdbTitle,
  type TmdbSummary,
} from "../lib/tmdb-payload.ts";
import type { Bindings } from "../types.ts";

const API_BASE = "https://api.themoviedb.org/3";
const PROVIDER_REGION = "GB";

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
  ].slice(0, 24);

  return Promise.all(uniqueSummaries.map((summary) => getTitleDetails(env, summary)));
}

async function getTitleDetails(env: Bindings, summary: TmdbSummary) {
  const append =
    summary.mediaType === "movie"
      ? "watch/providers,release_dates,external_ids"
      : "watch/providers,content_ratings,external_ids";
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
    const items = await hydrateTitles(env, parseTmdbSummaries(response).slice(0, 16));

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
            summaries: parseTmdbSummaries(trending).slice(0, 8),
          },
        ]
      : []),
    {
      id: "movies",
      title: providerIds.length ? "Movies on your services" : "Popular movies",
      description: providerIds.length
        ? "GB availability supplied by JustWatch via TMDB"
        : "Popular movies on TMDB",
      summaries: parseTmdbSummaries(movies, "movie").slice(0, 8),
    },
    {
      id: "television",
      title: providerIds.length ? "TV on your services" : "Popular television",
      description: providerIds.length
        ? "GB availability supplied by JustWatch via TMDB"
        : "Popular television on TMDB",
      summaries: parseTmdbSummaries(television, "tv").slice(0, 8),
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

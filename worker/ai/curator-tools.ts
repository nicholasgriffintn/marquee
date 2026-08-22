import type { MediaTitle } from "../../src/domain/catalog.ts";
import type { ToolCall } from "../lib/curator-payload.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord, parseJson } from "../lib/values.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { readRanked, type CatalogueSearch } from "../repositories/catalog-search.ts";
import { similarTo } from "../services/embeddings.ts";
import { retrieveTitles } from "../services/retrieval.ts";
import type { Bindings, ViewerContext } from "../types.ts";

export const SEARCH_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_catalogue",
    description:
      "Search Marquee's whole catalogue. The query understands moods and descriptions as well as words in the title, so 'slow burn on a rainy night' works as well as a genre. Call it repeatedly with different phrasings, sort orders and score floors to dig past the obvious hits. Score sorting is vote-weighted, so obscure titles with a handful of votes will not dominate.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A description of the watch you want, or words from its title.",
        },
        genres: { type: "array", items: { type: "string" }, maxItems: 10 },
        mediaType: { type: "string", enum: ["movie", "tv"] },
        minScore: { type: "number", minimum: 0, maximum: 10 },
        minVotes: {
          type: "integer",
          minimum: 0,
          description:
            "Minimum TMDB vote count. Defaults to 50 when sorting by score, so a 10/10 from three votes cannot win.",
        },
        releasedAfter: { type: "integer", minimum: 1900, maximum: 2100 },
        sort: { type: "string", enum: ["popularity", "score", "recent"] },
        limit: { type: "integer", minimum: 1, maximum: 30 },
      },
      additionalProperties: false,
    },
  },
};

export const CURATOR_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_viewing_profile",
      description:
        "Read the viewer's saved titles, ratings, notes, statuses, and selected streaming providers.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_catalogue",
      description:
        "Search Marquee's whole catalogue. The query understands moods and descriptions as well as words in the title, so 'slow burn on a rainy night' works as well as a genre. Call it repeatedly with different phrasings, sort orders and score floors to dig past the obvious hits. Score sorting is vote-weighted, so obscure titles with a handful of votes will not dominate.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A description of the watch you want, or words from its title.",
          },
          genres: { type: "array", items: { type: "string" }, maxItems: 10 },
          mediaType: { type: "string", enum: ["movie", "tv"] },
          minScore: { type: "number", minimum: 0, maximum: 10 },
          minVotes: {
            type: "integer",
            minimum: 0,
            description:
              "Minimum TMDB vote count. Defaults to 50 when sorting by score, so a 10/10 from three votes cannot win.",
          },
          availableOnSelectedServices: {
            type: "boolean",
            description: "Default true. Restrict results to providers selected by the viewer.",
          },
          excludeWatched: {
            type: "boolean",
            description:
              "Default true. Exclude watched and dropped titles unless a rewatch is requested.",
          },
          releasedAfter: { type: "integer", minimum: 1900, maximum: 2100 },
          sort: {
            type: "string",
            enum: ["popularity", "score", "recent"],
            description:
              "Order results. Use score to surface acclaimed titles beyond the obvious hits.",
          },
          limit: { type: "integer", minimum: 1, maximum: 30 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_similar",
      description:
        "Find catalogue titles that feel like a specific title the viewer already knows. Use it to build a shelf around something they rated highly.",
      parameters: {
        type: "object",
        properties: {
          titleId: { type: "string", pattern: "^(movie|tv):[1-9][0-9]*$" },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["titleId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_title_details",
      description:
        "Read full catalogue records for specific title IDs returned by catalogue search.",
      parameters: {
        type: "object",
        properties: {
          titleIds: {
            type: "array",
            items: { type: "string", pattern: "^(movie|tv):[1-9][0-9]*$" },
            minItems: 1,
            maxItems: 10,
          },
        },
        required: ["titleIds"],
        additionalProperties: false,
      },
    },
  },
];

export async function executeCuratorTool(
  env: Bindings,
  call: ToolCall,
  viewer: ViewerContext,
  availableIds: Set<string>,
  alwaysExclude: string[] = [],
) {
  const parsedArguments = parseJson(call.function.arguments);
  const argumentsValue = isRecord(parsedArguments) ? parsedArguments : {};

  if (call.function.name === "get_viewing_profile") {
    const titles = await readItems(
      env.DB,
      viewer.entries.map((entry) => entry.titleId),
    );
    const byId = new Map(titles.map((title) => [title.id, title]));

    return {
      selectedProviderIds: viewer.selectedProviderIds,
      entries: viewer.entries.map((entry) => {
        const title = byId.get(entry.titleId);

        return {
          id: entry.titleId,
          title: title?.title ?? entry.titleId,
          year: title?.year ?? null,
          genres: title?.genres.slice(0, 3) ?? [],
          status: entry.status,
          rating: entry.rating,
          thoughts: entry.thoughts.slice(0, 120),
        };
      }),
    };
  }

  if (call.function.name === "search_catalogue") {
    const search = buildSearch(argumentsValue, viewer, alwaysExclude);
    const results = await retrieveTitles(env, { ...search, text: search.query });

    return summarise(results, availableIds);
  }

  if (call.function.name === "find_similar") {
    const titleId = isKnownTitle(argumentsValue.titleId) ? argumentsValue.titleId : null;

    if (!titleId) {
      return { error: "Unknown title id" };
    }

    const search = buildSearch(argumentsValue, viewer, [...alwaysExclude, titleId]);
    const neighbours = await similarTo(env, titleId, 60);
    const results = neighbours.length
      ? (await readRanked(env.DB, neighbours))
          .filter((item) => !search.excludeIds?.includes(item.id))
          .slice(0, search.limit ?? 12)
      : [];

    return summarise(results, availableIds);
  }

  if (call.function.name === "get_title_details") {
    const titleIds = Array.isArray(argumentsValue.titleIds)
      ? argumentsValue.titleIds.filter(isKnownTitle).slice(0, 10)
      : [];
    const items = await readItems(env.DB, titleIds);

    for (const item of items) {
      availableIds.add(item.id);
    }

    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        year: item.year,
        genres: item.genres,
        tmdbScore: item.tmdbScore,
        runtimeMinutes: item.runtimeMinutes,
        overview: item.overview.slice(0, 400),
      })),
    };
  }

  return { error: "Unknown tool" };
}

function summarise(results: MediaTitle[], availableIds: Set<string>) {
  for (const item of results) {
    availableIds.add(item.id);
  }

  return {
    results: results.map((item) => ({
      id: item.id,
      title: item.title,
      year: item.year,
      mediaType: item.mediaType,
      genres: item.genres.slice(0, 3),
      keywords: (item.keywords ?? []).slice(0, 6),
      tmdbScore: item.tmdbScore,
      tmdbVoteCount: item.tmdbVoteCount,
      overview: item.overview.slice(0, 160),
    })),
  };
}

function buildSearch(
  argumentsValue: Record<string, unknown>,
  viewer: ViewerContext,
  alwaysExclude: string[] = [],
): CatalogueSearch {
  const excludeIds = [
    ...alwaysExclude,
    ...(argumentsValue.excludeWatched === false
      ? []
      : viewer.entries
          .filter((entry) => entry.status === "watched" || entry.status === "dropped")
          .map((entry) => entry.titleId)),
  ];

  return {
    query: typeof argumentsValue.query === "string" ? argumentsValue.query : undefined,
    genres: Array.isArray(argumentsValue.genres)
      ? argumentsValue.genres.filter((genre): genre is string => typeof genre === "string")
      : undefined,
    mediaType:
      argumentsValue.mediaType === "movie" || argumentsValue.mediaType === "tv"
        ? argumentsValue.mediaType
        : undefined,
    providerIds:
      argumentsValue.availableOnSelectedServices === false ? [] : viewer.selectedProviderIds,
    minScore: typeof argumentsValue.minScore === "number" ? argumentsValue.minScore : undefined,
    minVotes: typeof argumentsValue.minVotes === "number" ? argumentsValue.minVotes : undefined,
    releasedAfter:
      typeof argumentsValue.releasedAfter === "number" ? argumentsValue.releasedAfter : undefined,
    sort:
      argumentsValue.sort === "score" || argumentsValue.sort === "recent"
        ? argumentsValue.sort
        : undefined,
    excludeIds,
    limit: typeof argumentsValue.limit === "number" ? argumentsValue.limit : undefined,
  };
}

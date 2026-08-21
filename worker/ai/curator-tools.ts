import type { ToolCall } from "../lib/curator-payload.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord, parseJson } from "../lib/values.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { type CatalogueSearch, searchCatalogue } from "../repositories/catalog-search.ts";
import type { Bindings, ViewerContext } from "../types.ts";

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
        "Search Marquee's whole catalogue. Call it repeatedly with different genres, keywords, sort orders and score floors to dig past the obvious hits.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words expected in the title or synopsis." },
          genres: { type: "array", items: { type: "string" }, maxItems: 10 },
          mediaType: { type: "string", enum: ["movie", "tv"] },
          minScore: { type: "number", minimum: 0, maximum: 10 },
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

    return { ...viewer, titles };
  }

  if (call.function.name === "search_catalogue") {
    const results = await searchCatalogue(
      env.DB,
      buildSearch(argumentsValue, viewer, alwaysExclude),
    );

    for (const item of results) {
      availableIds.add(item.id);
    }

    return { results };
  }

  if (call.function.name === "get_title_details") {
    const titleIds = Array.isArray(argumentsValue.titleIds)
      ? argumentsValue.titleIds.filter(isKnownTitle).slice(0, 10)
      : [];
    const items = await readItems(env.DB, titleIds);

    for (const item of items) {
      availableIds.add(item.id);
    }

    return { items };
  }

  return { error: "Unknown tool" };
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

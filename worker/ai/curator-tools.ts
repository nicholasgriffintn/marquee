import type { ToolCall } from "../lib/curator-payload.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord, parseJson } from "../lib/values.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { CatalogueSearch } from "../repositories/catalog-search.ts";
import {
  explainCandidate,
  retrieveCandidates,
  retrieveSimilar,
  type Candidate,
} from "../services/retrieval/index.ts";
import type { Eligibility } from "../services/viewer/eligibility.ts";
import type { ViewerState } from "../services/viewer/state.ts";
import type { Bindings } from "../types.ts";

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
  viewer: ViewerState,
  eligibility: Eligibility,
  availableIds: Set<string>,
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
      selectedProviderIds: viewer.providerIds,
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
    const search = buildSearch(argumentsValue, viewer, eligibility);
    const candidates = await retrieveCandidates(env, { ...search, text: search.query });

    return summarise(candidates, availableIds);
  }

  if (call.function.name === "find_similar") {
    const titleId = isKnownTitle(argumentsValue.titleId) ? argumentsValue.titleId : null;

    if (!titleId) {
      return { error: "Unknown title id" };
    }

    const search = buildSearch(argumentsValue, viewer, eligibility, [titleId]);

    return summarise(await retrieveSimilar(env, titleId, search), availableIds);
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

function summarise(candidates: Candidate[], availableIds: Set<string>) {
  for (const candidate of candidates) {
    availableIds.add(candidate.title.id);
  }

  return {
    results: candidates.map((candidate) => ({
      id: candidate.title.id,
      title: candidate.title.title,
      year: candidate.title.year,
      mediaType: candidate.title.mediaType,
      genres: candidate.title.genres.slice(0, 3),
      keywords: (candidate.title.keywords ?? []).slice(0, 6),
      tmdbScore: candidate.title.tmdbScore,
      tmdbVoteCount: candidate.title.tmdbVoteCount,
      overview: candidate.title.overview.slice(0, 160),
      matchedOn: explainCandidate(candidate),
    })),
  };
}

function buildSearch(
  argumentsValue: Record<string, unknown>,
  viewer: ViewerState,
  eligibility: Eligibility,
  alsoExclude: string[] = [],
): CatalogueSearch {
  const keepShelved =
    argumentsValue.excludeWatched === false ? new Set(viewer.finished) : new Set<string>();
  const excludeIds = [
    ...alsoExclude,
    ...eligibility.excludeIds.filter((titleId) => !keepShelved.has(titleId)),
  ];

  return {
    ...eligibility,
    query: typeof argumentsValue.query === "string" ? argumentsValue.query : undefined,
    genres: Array.isArray(argumentsValue.genres)
      ? argumentsValue.genres.filter((genre): genre is string => typeof genre === "string")
      : undefined,
    ...(argumentsValue.mediaType === "movie" || argumentsValue.mediaType === "tv"
      ? { mediaType: argumentsValue.mediaType }
      : {}),
    providerIds:
      argumentsValue.availableOnSelectedServices === false ? [] : eligibility.providerIds,
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

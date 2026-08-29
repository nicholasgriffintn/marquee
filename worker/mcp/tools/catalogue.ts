import { isKnownTitle } from "../../lib/validation.ts";
import { readItems } from "../../repositories/catalog-reader.ts";
import { retrieveSimilar, retrieveTitles } from "../../services/retrieval/index.ts";
import { getTitleInsight } from "../../services/title-insight.ts";
import { answer, type McpTool, READS, refuse } from "../registry.ts";
import { summarise, TITLE_SUMMARY_SCHEMA, titleResultsSchema } from "../summaries.ts";

const SCOPE = "catalogue:read" as const;
const MAX_RESULTS = 25;
const DEFAULT_RESULTS = 10;
const MAX_QUERY_LENGTH = 300;

function boundedLimit(value: unknown, ceiling = MAX_RESULTS) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(ceiling, Math.round(value)))
    : DEFAULT_RESULTS;
}

export const catalogueTools: readonly McpTool[] = [
  {
    name: "search_catalogue",
    title: "Search the catalogue",
    description:
      "Search Marquee's film and television catalogue. The query understands moods and descriptions as well as words in a title, so 'slow burn on a rainy night' works as well as a genre.",
    scope: SCOPE,
    annotations: READS,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What you are looking for." },
        mediaType: { type: "string", enum: ["movie", "tv"] },
        genres: { type: "array", items: { type: "string" } },
        minScore: { type: "number", minimum: 0, maximum: 10 },
        releasedAfter: { type: "integer", minimum: 1900, maximum: 2100 },
        limit: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
      },
      required: ["query"],
    },
    outputSchema: titleResultsSchema(),
    async run({ env, user }, input) {
      const { success } = await env.SEARCH_MEMBER_RATE_LIMITER.limit({ key: user.id });

      if (!success) {
        return refuse("Too many searches. Wait a minute.");
      }

      const results = await retrieveTitles(env, {
        text: typeof input.query === "string" ? input.query.slice(0, MAX_QUERY_LENGTH) : "",
        mediaType:
          input.mediaType === "movie" || input.mediaType === "tv" ? input.mediaType : undefined,
        genres: Array.isArray(input.genres)
          ? input.genres.filter((genre): genre is string => typeof genre === "string")
          : undefined,
        minScore: typeof input.minScore === "number" ? input.minScore : undefined,
        releasedAfter: typeof input.releasedAfter === "number" ? input.releasedAfter : undefined,
        providerIds: [],
        limit: boundedLimit(input.limit),
      });

      return answer({ results: summarise(results) });
    },
  },
  {
    name: "find_similar",
    title: "Find similar titles",
    description: "Find catalogue titles that feel like a given title.",
    scope: SCOPE,
    annotations: READS,
    inputSchema: {
      type: "object",
      properties: {
        titleId: { type: "string", description: "A Marquee id such as movie:550." },
        limit: { type: "integer", minimum: 1, maximum: MAX_RESULTS },
      },
      required: ["titleId"],
    },
    outputSchema: titleResultsSchema(),
    async run({ env }, input) {
      if (!isKnownTitle(input.titleId)) {
        return refuse("titleId must look like movie:550");
      }

      const similar = await retrieveSimilar(env, input.titleId, {
        limit: boundedLimit(input.limit),
      });

      return answer({ results: summarise(similar.map((candidate) => candidate.title)) });
    },
  },
  {
    name: "get_title",
    title: "Read a title",
    description: "Read the full record for a title, including where it is streaming.",
    scope: SCOPE,
    annotations: READS,
    inputSchema: {
      type: "object",
      properties: { titleId: { type: "string", description: "A Marquee id such as movie:550." } },
      required: ["titleId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        ...(TITLE_SUMMARY_SCHEMA.properties as Record<string, unknown>),
        certification: { type: ["string", "null"] },
        ratings: { type: ["object", "null"] },
        watchLink: { type: ["string", "null"] },
        hook: { type: ["string", "null"] },
        moods: { type: "array", items: { type: "string" } },
      },
      required: TITLE_SUMMARY_SCHEMA.required,
    },
    async run({ env, user }, input) {
      if (!isKnownTitle(input.titleId)) {
        return refuse("titleId must look like movie:550");
      }

      const [title] = await readItems(env.DB, [input.titleId]);

      if (!title) {
        return refuse("Unknown title");
      }

      const { success: canGenerate } = await env.CURATOR_RATE_LIMITER.limit({ key: user.id });
      const insight = await getTitleInsight(env, title.id, { generate: canGenerate }).catch(
        () => null,
      );

      return answer({
        ...summarise([title])[0],
        certification: title.certification,
        ratings: title.ratings ?? null,
        watchLink: title.watchLink,
        hook: insight?.hook ?? null,
        moods: insight?.moods ?? [],
      });
    },
  },
];

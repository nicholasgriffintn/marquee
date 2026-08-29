import type { readItems } from "../repositories/catalog-reader.ts";
import type { JsonSchema } from "./registry.ts";

export const TITLE_SUMMARY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "A Marquee id such as movie:550." },
    title: { type: "string" },
    year: { type: ["integer", "null"] },
    mediaType: { type: "string", enum: ["movie", "tv"] },
    genres: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    tmdbScore: { type: ["number", "null"] },
    runtimeMinutes: { type: ["integer", "null"] },
    overview: { type: "string" },
    streamingOn: { type: "array", items: { type: "string" } },
  },
  required: ["id", "title", "mediaType", "genres", "streamingOn"],
};

export function titleResultsSchema(): JsonSchema {
  return {
    type: "object",
    properties: { results: { type: "array", items: TITLE_SUMMARY_SCHEMA } },
    required: ["results"],
  };
}

export function summarise(items: Awaited<ReturnType<typeof readItems>>) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    year: item.year,
    mediaType: item.mediaType,
    genres: item.genres,
    keywords: (item.keywords ?? []).slice(0, 8),
    tmdbScore: item.tmdbScore,
    runtimeMinutes: item.runtimeMinutes,
    overview: item.overview.slice(0, 300),
    streamingOn: item.providers.map((provider) => provider.name),
  }));
}

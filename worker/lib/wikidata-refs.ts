import type { MediaType } from "../../src/domain/catalog.ts";
import { literals } from "../clients/wikidata-query.ts";

const TMDB_PROPERTY: Record<MediaType, string> = { movie: "P4947", tv: "P4983" };

const VARIABLE: Record<MediaType, string> = { movie: "movie", tv: "show" };

export type TmdbRef = { mediaType: MediaType; tmdbId: number };

export function tmdbKey(ref: TmdbRef) {
  return `${ref.mediaType}:${ref.tmdbId}`;
}

export function isUsableTmdbRef(ref: TmdbRef) {
  return Number.isInteger(ref.tmdbId) && ref.tmdbId > 0;
}

export function tmdbBranches(refs: TmdbRef[]) {
  const byType = new Map<MediaType, TmdbRef[]>();

  for (const ref of refs) {
    byType.set(ref.mediaType, [...(byType.get(ref.mediaType) ?? []), ref]);
  }

  return [...byType]
    .map(([mediaType, group]) => {
      const variable = VARIABLE[mediaType];

      return `{
    VALUES ?${variable} { ${literals(group.map((ref) => ref.tmdbId))} }
    ?item wdt:${TMDB_PROPERTY[mediaType]} ?${variable} .
    BIND(CONCAT("${mediaType}:", ?${variable}) AS ?key)
  }`;
    })
    .join("\n  UNION\n  ");
}

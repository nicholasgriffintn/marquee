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

type BranchShape = { subject?: string; key?: string; also?: string; entities?: string[] };

export function tmdbBranches(refs: TmdbRef[], shape: BranchShape = {}) {
  const subject = shape.subject ?? "item";
  const key = shape.key ?? "key";
  const also = shape.also ? ` ; ${shape.also}` : "";
  const byType = new Map<MediaType, TmdbRef[]>();

  for (const ref of refs) {
    byType.set(ref.mediaType, [...(byType.get(ref.mediaType) ?? []), ref]);
  }

  const entities = (shape.entities ?? []).filter((id) => /^Q\d+$/u.test(id));
  const entityBranch = entities.length
    ? `{ VALUES ?${subject} { ${entities.map((id) => `wd:${id}`).join(" ")} } }`
    : null;

  return [
    entityBranch,
    ...[...byType].map(([mediaType, group]) => {
      const variable = VARIABLE[mediaType];

      return `{
    VALUES ?${variable} { ${literals(group.map((ref) => ref.tmdbId))} }
    ?${subject} wdt:${TMDB_PROPERTY[mediaType]} ?${variable}${also} .
    BIND(CONCAT("${mediaType}:", ?${variable}) AS ?${key})
  }`;
    }),
  ]
    .filter(Boolean)
    .join("\n  UNION\n  ");
}

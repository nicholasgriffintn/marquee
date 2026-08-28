import type { MediaType } from "../../src/domain/catalog.ts";
import { articleTitleFrom, entityIdFrom, literals, queryWikidata } from "./wikidata-query.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;
const BATCH = 80;

const TMDB_PROPERTY: Record<MediaType, string> = { movie: "P4947", tv: "P4983" };

export type EntityRef = { titleId: string; mediaType: MediaType; tmdbId: number };

export type TitleEntity = { entityId: string; article: string | null };

function refKey(ref: EntityRef) {
  return `${ref.mediaType}:${ref.tmdbId}`;
}

function branch(mediaType: MediaType, refs: EntityRef[]) {
  const variable = mediaType === "movie" ? "movie" : "show";

  return `{
    VALUES ?${variable} { ${literals(refs.map((ref) => ref.tmdbId))} }
    ?item wdt:${TMDB_PROPERTY[mediaType]} ?${variable} .
    BIND(CONCAT("${mediaType}:", ?${variable}) AS ?key)
  }`;
}

async function queryBatch(refs: EntityRef[]) {
  const byType = new Map<MediaType, EntityRef[]>();

  for (const ref of refs) {
    byType.set(ref.mediaType, [...(byType.get(ref.mediaType) ?? []), ref]);
  }

  const branches = [...byType].map(([mediaType, group]) => branch(mediaType, group));
  const rows = await queryWikidata(
    `SELECT ?key ?item ?article WHERE {
  ${branches.join("\n  UNION\n  ")}
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const titleIds = new Map(refs.map((ref) => [refKey(ref), ref.titleId]));
  const matched = new Map<string, TitleEntity>();

  for (const row of rows) {
    const titleId = titleIds.get(row.key ?? "");
    const entity = entityIdFrom(row.item);

    if (!titleId || !entity) {
      continue;
    }

    const article = articleTitleFrom(row.article);
    const seen = matched.get(titleId);

    if (!seen || (!seen.article && article)) {
      matched.set(titleId, { entityId: entity, article });
    }
  }

  return matched;
}

export async function resolveEntities(refs: EntityRef[]) {
  const unique = new Map(
    refs
      .filter((ref) => Number.isInteger(ref.tmdbId) && ref.tmdbId > 0)
      .map((ref) => [ref.titleId, ref]),
  );
  const usable = [...unique.values()];
  const matched = new Map<string, TitleEntity>();

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryBatch(usable.slice(index, index + BATCH));

    for (const [titleId, entity] of wave) {
      matched.set(titleId, entity);
    }
  }

  return matched;
}

import { isUsableTmdbRef, tmdbBranches, tmdbKey, type TmdbRef } from "../lib/wikidata-refs.ts";
import { articleTitleFrom, entityIdFrom, queryWikidata } from "./wikidata-query.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;
const BATCH = 80;

export type EntityRef = TmdbRef & { titleId: string };

export type TitleEntity = { entityId: string; article: string | null };

async function queryBatch(refs: EntityRef[]) {
  const rows = await queryWikidata(
    `SELECT ?key ?item ?article WHERE {
  ${tmdbBranches(refs)}
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const titleIds = new Map(refs.map((ref) => [tmdbKey(ref), ref.titleId]));
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
  const unique = new Map(refs.filter(isUsableTmdbRef).map((ref) => [ref.titleId, ref]));
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

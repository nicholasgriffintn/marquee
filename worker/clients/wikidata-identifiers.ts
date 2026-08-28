import type { MediaType } from "../../src/domain/catalog.ts";
import {
  cleanIdentifier,
  IDENTIFIER_FIELDS,
  type IdentifierField,
  type TitleIdentifiers,
} from "../../src/domain/identifiers.ts";
import { isUsableTmdbRef, tmdbBranches, tmdbKey } from "../lib/wikidata-refs.ts";
import { entityIdFrom, queryWikidata, type SparqlRow } from "./wikidata-query.ts";

const TIMEOUT_MS = 30_000;
const CACHE_TTL = 604_800;
const BATCH = 60;

const PROPERTIES: Record<IdentifierField, { property: string; variable: string }> = {
  letterboxdId: { property: "P6127", variable: "letterboxd" },
  rottenTomatoesId: { property: "P1258", variable: "tomatoes" },
  metacriticId: { property: "P1712", variable: "metacritic" },
  traktId: { property: "P8013", variable: "trakt" },
};

export type IdentifierRef = {
  titleId: string;
  mediaType: MediaType;
  tmdbId: number;
  wikidataId: string | null;
};

function buildQuery(refs: IdentifierRef[]) {
  const projection = IDENTIFIER_FIELDS.map(
    (field) => `(SAMPLE(?${PROPERTIES[field].variable}) AS ?${field})`,
  ).join(" ");
  const optionals = IDENTIFIER_FIELDS.map(
    (field) =>
      `OPTIONAL { ?item wdt:${PROPERTIES[field].property} ?${PROPERTIES[field].variable} . }`,
  ).join("\n  ");

  return `SELECT ?item ?key ${projection} WHERE {
  ${tmdbBranches(refs, { entities: refs.flatMap((ref) => (ref.wikidataId ? [ref.wikidataId] : [])) })}
  ${optionals}
} GROUP BY ?item ?key`;
}

function readRow(row: SparqlRow): TitleIdentifiers {
  return {
    letterboxdId: cleanIdentifier("letterboxdId", row.letterboxdId),
    rottenTomatoesId: cleanIdentifier("rottenTomatoesId", row.rottenTomatoesId),
    metacriticId: cleanIdentifier("metacriticId", row.metacriticId),
    traktId: cleanIdentifier("traktId", row.traktId),
  };
}

function scoreRow(identifiers: TitleIdentifiers) {
  return IDENTIFIER_FIELDS.filter((field) => identifiers[field] !== null).length;
}

async function queryBatch(refs: IdentifierRef[]) {
  const rows = await queryWikidata(buildQuery(refs), {
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });
  const byKey = new Map(refs.map((ref) => [tmdbKey(ref), ref.titleId]));
  const byEntity = new Map(
    refs.flatMap((ref) => (ref.wikidataId ? [[ref.wikidataId, ref.titleId]] : [])),
  );
  const matched = new Map<string, TitleIdentifiers>();

  for (const row of rows) {
    const entity = entityIdFrom(row.item);
    const titleId = byKey.get(row.key ?? "") ?? (entity ? byEntity.get(entity) : null);

    if (!titleId) {
      continue;
    }

    const identifiers = readRow(row);
    const seen = matched.get(titleId);
    const score = scoreRow(identifiers);

    if (score > 0 && (!seen || score > scoreRow(seen))) {
      matched.set(titleId, identifiers);
    }
  }

  return matched;
}

export async function readTitleIdentifiers(refs: IdentifierRef[]) {
  const usable = [
    ...new Map(
      refs
        .filter((ref) => isUsableTmdbRef(ref))
        .map((ref): [string, IdentifierRef] => [
          ref.titleId,
          {
            ...ref,
            wikidataId: ref.wikidataId && /^Q\d+$/u.test(ref.wikidataId) ? ref.wikidataId : null,
          },
        ]),
    ).values(),
  ];
  const matched = new Map<string, TitleIdentifiers>();

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryBatch(usable.slice(index, index + BATCH));

    for (const [titleId, identifiers] of wave) {
      matched.set(titleId, identifiers);
    }
  }

  return matched;
}

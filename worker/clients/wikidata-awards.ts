import { isAwardOutcome, type AwardOutcome } from "../../src/domain/awards.ts";
import { slugify } from "../../src/domain/slug.ts";
import {
  entityIdFrom,
  literals,
  queryWikidata,
  yearFrom,
  type SparqlRow,
} from "./wikidata-query.ts";

const TIMEOUT_MS = 25_000;
const CACHE_TTL = 604_800;
const BATCH = 50;
const MAX_LABEL = 160;

export type AwardStatement = {
  key: string;
  awardId: string;
  wikidataId: string;
  label: string;
  ceremonyYear: number | null;
  outcome: AwardOutcome;
};

const BRANCHES = `{ ?item p:P166 ?statement . ?statement ps:P166 ?award . BIND("won" AS ?outcome) }
  UNION
  { ?item p:P1411 ?statement . ?statement ps:P1411 ?award . BIND("nominated" AS ?outcome) }
  OPTIONAL { ?statement pq:P585 ?ceremony . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;

function statementsFrom(rows: SparqlRow[], keyOf: (row: SparqlRow) => string | null) {
  const statements: AwardStatement[] = [];

  for (const row of rows) {
    const key = keyOf(row);
    const wikidataId = entityIdFrom(row.award);
    const label = (row.awardLabel ?? "").trim().slice(0, MAX_LABEL);
    const awardId = slugify(label);

    if (!key || !wikidataId || !awardId || label === wikidataId || !isAwardOutcome(row.outcome)) {
      continue;
    }

    statements.push({
      key,
      awardId,
      wikidataId,
      label,
      ceremonyYear: yearFrom(row.ceremony),
      outcome: row.outcome,
    });
  }

  return statements;
}

async function titleBatch(entityIds: string[]) {
  const rows = await queryWikidata(
    `SELECT ?item ?award ?awardLabel ?ceremony ?outcome WHERE {
  VALUES ?item { ${entityIds.map((id) => `wd:${id}`).join(" ")} }
  ${BRANCHES}
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  return statementsFrom(rows, (row) => entityIdFrom(row.item));
}

async function personBatch(tmdbIds: number[]) {
  const rows = await queryWikidata(
    `SELECT ?person ?award ?awardLabel ?ceremony ?outcome WHERE {
  VALUES ?person { ${literals(tmdbIds)} }
  ?item wdt:P4985 ?person .
  ${BRANCHES}
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  return statementsFrom(rows, (row) => row.person ?? null);
}

async function collect<Input>(inputs: Input[], run: (wave: Input[]) => Promise<AwardStatement[]>) {
  const statements: AwardStatement[] = [];

  for (let index = 0; index < inputs.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    statements.push(...(await run(inputs.slice(index, index + BATCH))));
  }

  return statements;
}

export function fetchTitleAwards(entityIds: string[]) {
  return collect(
    entityIds.filter((id) => /^Q\d+$/u.test(id)),
    titleBatch,
  );
}

export function fetchPersonAwards(tmdbIds: number[]) {
  return collect(
    tmdbIds.filter((id) => Number.isInteger(id) && id > 0),
    personBatch,
  );
}

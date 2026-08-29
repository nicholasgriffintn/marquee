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

export type PersonCandidate = { personId: number; gender: number | null };

const BRANCHES = `{ ?item p:P166 ?statement . ?statement ps:P166 ?award . BIND("won" AS ?outcome) }
  UNION
  { ?item p:P1411 ?statement . ?statement ps:P1411 ?award . BIND("nominated" AS ?outcome) }
  OPTIONAL { ?statement pq:P585 ?ceremony . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;

const TMDB_FEMALE = 1;
const TMDB_MALE = 2;
const WIKIDATA_GENDER: Record<string, number> = {
  "http://www.wikidata.org/entity/Q6581097": TMDB_MALE,
  "http://www.wikidata.org/entity/Q6581072": TMDB_FEMALE,
};

function genderMismatch(row: SparqlRow, knownGender: Map<string, number | null>) {
  const known = knownGender.get(row.person ?? "");
  const claimed = row.gender ? WIKIDATA_GENDER[row.gender] : undefined;

  return known != null && claimed != null && known !== claimed;
}

function statementsFrom(
  rows: SparqlRow[],
  keyOf: (row: SparqlRow) => string | null,
  isValid: (row: SparqlRow) => boolean = () => true,
) {
  const statements: AwardStatement[] = [];

  for (const row of rows) {
    const key = keyOf(row);
    const wikidataId = entityIdFrom(row.award);
    const label = (row.awardLabel ?? "").trim().slice(0, MAX_LABEL);
    const awardId = slugify(label);

    if (
      !key ||
      !wikidataId ||
      !awardId ||
      label === wikidataId ||
      !isAwardOutcome(row.outcome) ||
      !isValid(row)
    ) {
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

async function personBatch(people: PersonCandidate[]) {
  const rows = await queryWikidata(
    `SELECT ?person ?award ?awardLabel ?ceremony ?outcome ?gender WHERE {
  VALUES ?person { ${literals(people.map((person) => person.personId))} }
  ?item wdt:P4985 ?person .
  OPTIONAL { ?item wdt:P21 ?gender . }
  ${BRANCHES}
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  const knownGender = new Map(people.map((person) => [String(person.personId), person.gender]));

  return statementsFrom(
    rows,
    (row) => row.person ?? null,
    (row) => !genderMismatch(row, knownGender),
  );
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

export function fetchPersonAwards(people: PersonCandidate[]) {
  return collect(
    people.filter((person) => Number.isInteger(person.personId) && person.personId > 0),
    personBatch,
  );
}

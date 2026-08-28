import { isUsableTmdbRef, tmdbBranches, tmdbKey, type TmdbRef } from "../lib/wikidata-refs.ts";
import { queryWikidata } from "./wikidata-query.ts";

const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;
const BATCH = 150;

export type FormRef = TmdbRef & { titleId: string };

export type FormLabels = { colours: string[]; ratios: string[] };

function collect(
  target: Map<string, FormLabels>,
  titleId: string,
  key: keyof FormLabels,
  value: string | undefined,
) {
  if (!value) {
    return;
  }

  const entry = target.get(titleId) ?? { colours: [], ratios: [] };

  if (!entry[key].includes(value)) {
    entry[key].push(value);
  }

  target.set(titleId, entry);
}

async function queryBatch(refs: FormRef[]) {
  const rows = await queryWikidata(
    `SELECT ?key ?colourLabel ?ratioLabel WHERE {
  ${tmdbBranches(refs)}
  OPTIONAL { ?item wdt:P462 ?colour . }
  OPTIONAL { ?item wdt:P2061 ?ratio . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const titleIds = new Map(refs.map((ref) => [tmdbKey(ref), ref.titleId]));
  const found = new Map<string, FormLabels>();

  for (const row of rows) {
    const titleId = titleIds.get(row.key ?? "");

    if (!titleId) {
      continue;
    }

    collect(found, titleId, "colours", row.colourLabel);
    collect(found, titleId, "ratios", row.ratioLabel);
  }

  return found;
}

export async function fetchTitleForms(refs: FormRef[]) {
  const unique = new Map(refs.filter(isUsableTmdbRef).map((ref) => [ref.titleId, ref]));
  const usable = [...unique.values()];
  const found = new Map<string, FormLabels>();

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryBatch(usable.slice(index, index + BATCH));

    for (const [titleId, labels] of wave) {
      found.set(titleId, labels);
    }
  }

  return found;
}

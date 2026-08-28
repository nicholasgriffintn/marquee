import { entityIdFrom, literals, queryWikidata, yearFrom } from "./wikidata-query.ts";

const CACHE_TTL = 604_800;
const BATCH = 40;
const TIMEOUT_MS = 30_000;

export type FilmRef = { key: string; wikidataId?: string | null; imdbId?: string | null };

export type FilmAuthors = {
  key: string;
  named: number;
  withDeathYear: number;
  latestDeathYear: number | null;
};

function clauses(refs: FilmRef[]) {
  const entities = refs.flatMap((ref) => (ref.wikidataId ? [`wd:${ref.wikidataId}`] : []));
  const imdbIds = refs.flatMap((ref) => (ref.imdbId ? [ref.imdbId] : []));
  const parts = [
    entities.length ? `{ VALUES ?film { ${entities.join(" ")} } }` : null,
    imdbIds.length ? `{ VALUES ?imdb { ${literals(imdbIds)} } ?film wdt:P345 ?imdb . }` : null,
  ].filter(Boolean);

  return parts.join("\n  UNION\n  ");
}

async function queryAuthors(refs: FilmRef[]) {
  const rows = await queryWikidata(
    `SELECT ?film ?imdb ?person ?death WHERE {
  ${clauses(refs)}
  { ?film wdt:P57 ?person } UNION { ?film wdt:P58 ?person } UNION { ?film wdt:P86 ?person }
  OPTIONAL { ?person wdt:P570 ?death . }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const byEntity = new Map<string, string>();
  const byImdb = new Map<string, string>();

  for (const ref of refs) {
    if (ref.wikidataId) {
      byEntity.set(ref.wikidataId, ref.key);
    }

    if (ref.imdbId) {
      byImdb.set(ref.imdbId, ref.key);
    }
  }

  const people = new Map<string, Map<string, number | null>>();

  for (const row of rows) {
    const person = row.person ?? null;
    const entity = entityIdFrom(row.film);
    const key = (entity ? byEntity.get(entity) : null) ?? (row.imdb ? byImdb.get(row.imdb) : null);

    if (!key || !person) {
      continue;
    }

    const year = yearFrom(row.death);
    const seen = people.get(key) ?? new Map<string, number | null>();
    const known = seen.get(person) ?? null;

    seen.set(person, year !== null && (known === null || year > known) ? year : known);
    people.set(key, seen);
  }

  return [...people].map(([key, byPerson]): FilmAuthors => {
    const years = [...byPerson.values()].filter((year): year is number => year !== null);

    return {
      key,
      named: byPerson.size,
      withDeathYear: years.length,
      latestDeathYear: years.length ? Math.max(...years) : null,
    };
  });
}

export async function readFilmAuthors(refs: FilmRef[]) {
  const usable = refs.flatMap((ref) => {
    const wikidataId = ref.wikidataId && /^Q\d+$/u.test(ref.wikidataId) ? ref.wikidataId : null;
    const imdbId = ref.imdbId && /^tt\d+$/u.test(ref.imdbId) ? ref.imdbId : null;

    return wikidataId || imdbId ? [{ key: ref.key, wikidataId, imdbId }] : [];
  });
  const found = new Map<string, FilmAuthors>();

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryAuthors(usable.slice(index, index + BATCH));

    for (const entry of wave) {
      found.set(entry.key, entry);
    }
  }

  return found;
}

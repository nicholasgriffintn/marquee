import { isRecord, records, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";

const CACHE_TTL = 604_800;

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH = 40;
const TIMEOUT_MS = 30_000;

export type FilmRef = { key: string; wikidataId?: string | null; imdbId?: string | null };

export type FilmAuthors = {
  key: string;
  named: number;
  withDeathYear: number;
  latestDeathYear: number | null;
};

function yearOf(value: string) {
  const match = /^-?(\d{4})/u.exec(value);

  return match ? Number(match[1]) : null;
}

function entityId(value: string) {
  const match = /\/(Q\d+)$/u.exec(value);

  return match ? match[1] : null;
}

function clauses(refs: FilmRef[]) {
  const entities = refs.flatMap((ref) => (ref.wikidataId ? [`wd:${ref.wikidataId}`] : []));
  const imdbIds = refs.flatMap((ref) => (ref.imdbId ? [`"${ref.imdbId}"`] : []));
  const parts = [
    entities.length ? `{ VALUES ?film { ${entities.join(" ")} } }` : null,
    imdbIds.length ? `{ VALUES ?imdb { ${imdbIds.join(" ")} } ?film wdt:P345 ?imdb . }` : null,
  ].filter(Boolean);

  return parts.join("\n  UNION\n  ");
}

async function queryAuthors(refs: FilmRef[]) {
  const query = `SELECT ?film ?imdb ?person ?death WHERE {
  ${clauses(refs)}
  VALUES ?prop { wdt:P57 wdt:P58 wdt:P86 wdt:P1040 }
  ?film ?prop ?person .
  OPTIONAL { ?person wdt:P570 ?death . }
}`;
  const url = new URL(SPARQL_ENDPOINT);

  url.search = new URLSearchParams({ query, format: "json" }).toString();

  const response = await upstreamFetch(url, {
    headers: { accept: "application/sparql-results+json", "user-agent": UPSTREAM_AGENT },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });

  if (!response.ok) {
    throw new Error(`Wikidata rights query failed (${response.status})`);
  }

  const payload = await response.json();
  const bindings = isRecord(payload) && isRecord(payload.results) ? payload.results.bindings : [];
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

  for (const binding of records(bindings)) {
    const film = isRecord(binding.film) ? stringAt(binding.film, "value") : null;
    const imdb = isRecord(binding.imdb) ? stringAt(binding.imdb, "value") : null;
    const person = isRecord(binding.person) ? stringAt(binding.person, "value") : null;
    const entity = film ? entityId(film) : null;
    const key = (entity ? byEntity.get(entity) : null) ?? (imdb ? byImdb.get(imdb) : null);

    if (!key || !person) {
      continue;
    }

    const death = isRecord(binding.death) ? stringAt(binding.death, "value") : null;
    const year = death ? yearOf(death) : null;
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

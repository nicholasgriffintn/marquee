import { isRecord, records, stringAt } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";

const CACHE_TTL = 604_800;

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Marquee/1.0 (personal streaming discovery; https://marquee.pashi.app)";
const BATCH = 40;
const TIMEOUT_MS = 30_000;

export type FilmAuthors = {
  imdbId: string;
  named: number;
  withDeathYear: number;
  latestDeathYear: number | null;
};

function yearOf(value: string) {
  const match = /^-?(\d{4})/u.exec(value);

  return match ? Number(match[1]) : null;
}

async function queryAuthors(imdbIds: string[]) {
  const values = imdbIds.map((id) => `"${id}"`).join(" ");
  const query = `SELECT ?imdb ?person ?death WHERE {
  VALUES ?imdb { ${values} }
  ?film wdt:P345 ?imdb .
  VALUES ?prop { wdt:P57 wdt:P58 wdt:P86 wdt:P1040 }
  ?film ?prop ?person .
  OPTIONAL { ?person wdt:P570 ?death . }
}`;
  const url = new URL(SPARQL_ENDPOINT);

  url.search = new URLSearchParams({ query, format: "json" }).toString();

  const response = await upstreamFetch(url, {
    headers: { accept: "application/sparql-results+json", "user-agent": USER_AGENT },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });

  if (!response.ok) {
    throw new Error(`Wikidata rights query failed (${response.status})`);
  }

  const payload = await response.json();
  const bindings = isRecord(payload) && isRecord(payload.results) ? payload.results.bindings : [];
  const people = new Map<string, Map<string, number | null>>();

  for (const binding of records(bindings)) {
    const imdb = isRecord(binding.imdb) ? stringAt(binding.imdb, "value") : null;
    const person = isRecord(binding.person) ? stringAt(binding.person, "value") : null;

    if (!imdb || !person) {
      continue;
    }

    const death = isRecord(binding.death) ? stringAt(binding.death, "value") : null;
    const year = death ? yearOf(death) : null;
    const seen = people.get(imdb) ?? new Map<string, number | null>();
    const known = seen.get(person) ?? null;

    seen.set(person, year !== null && (known === null || year > known) ? year : known);
    people.set(imdb, seen);
  }

  return [...people].map(([imdbId, byPerson]): FilmAuthors => {
    const years = [...byPerson.values()].filter((year): year is number => year !== null);

    return {
      imdbId,
      named: byPerson.size,
      withDeathYear: years.length,
      latestDeathYear: years.length ? Math.max(...years) : null,
    };
  });
}

export async function readFilmAuthors(imdbIds: string[]) {
  const unique = [...new Set(imdbIds.filter((id) => /^tt\d+$/u.test(id)))];
  const found = new Map<string, FilmAuthors>();

  for (let index = 0; index < unique.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const wave = await queryAuthors(unique.slice(index, index + BATCH));

    for (const entry of wave) {
      found.set(entry.imdbId, entry);
    }
  }

  return found;
}

import {
  runtimeKind,
  type RevivalKind,
  type RevivalRightsBasis,
  type RevivalTag,
} from "../../src/domain/revival.ts";
import { isUnsuitable } from "../lib/revival-safety.ts";
import { tagList } from "../lib/revival-tags.ts";
import { properTitle } from "../lib/revival-text.ts";
import { commonsFileName, readCommonsFiles, type CommonsFile } from "./commons.ts";
import { entityIdFrom, queryWikidata, yearFrom } from "./wikidata-query.ts";

const TIMEOUT_MS = 45_000;
const CACHE_TTL = 86_400;
const PAGE_SIZE = 50;
const MAX_OFFSET = 2_000;

export type WikidataCandidate = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  year: number | null;
  director: string | null;
  synopsis: string;
  kind: RevivalKind;
  runtimeSeconds: number | null;
  stillUrl: string | null;
  streamUrl: string;
  streamBytes: number | null;
  streamType: string;
  width: number | null;
  height: number | null;
  country: string | null;
  rightsBasis: RevivalRightsBasis;
  rightsNote: string;
  rightsUrl: string | null;
  tags: RevivalTag[];
};

type ClearedFilm = {
  entityId: string;
  fileName: string;
  lastDeathYear: number;
  namedAuthors: number;
};

type FilmDetail = {
  title: string;
  year: number | null;
  director: string | null;
  country: string | null;
  genres: string[];
};

export function wikidataPageCap() {
  return Math.floor(MAX_OFFSET / PAGE_SIZE);
}

async function readClearedFilms(page: number, deathBefore: number) {
  const rows = await queryWikidata(
    `SELECT ?film ?video (MAX(?death) AS ?lastDeath) (COUNT(DISTINCT ?person) AS ?named) WHERE {
  ?film wdt:P31 wd:Q11424 ; wdt:P10 ?video .
  ?film wdt:P57|wdt:P58|wdt:P86 ?person .
  OPTIONAL { ?person wdt:P570 ?death . BIND(?person AS ?dead) }
}
GROUP BY ?film ?video
HAVING (COUNT(DISTINCT ?person) = COUNT(DISTINCT ?dead) && MAX(?death) < "${deathBefore}-01-01"^^xsd:dateTime)
ORDER BY ?film
LIMIT ${PAGE_SIZE}
OFFSET ${(page - 1) * PAGE_SIZE}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const films = new Map<string, ClearedFilm>();

  for (const row of rows) {
    const entityId = entityIdFrom(row.film);
    const fileName = row.video ? commonsFileName(row.video) : null;
    const lastDeathYear = yearFrom(row.lastDeath);
    const namedAuthors = Number(row.named ?? "0");

    if (!entityId || !fileName || lastDeathYear === null || namedAuthors < 1) {
      continue;
    }

    if (!films.has(entityId)) {
      films.set(entityId, { entityId, fileName, lastDeathYear, namedAuthors });
    }
  }

  return { films: [...films.values()], drained: rows.length < PAGE_SIZE };
}

async function readDetails(entityIds: string[]) {
  const details = new Map<string, FilmDetail>();

  if (entityIds.length === 0) {
    return details;
  }

  const rows = await queryWikidata(
    `SELECT ?film ?title ?date ?director ?country ?genre WHERE {
  VALUES ?film { ${entityIds.map((id) => `wd:${id}`).join(" ")} }
  ?film rdfs:label ?title . FILTER(LANG(?title) = "en")
  OPTIONAL { ?film wdt:P577 ?date }
  OPTIONAL { ?film wdt:P57 ?person . ?person rdfs:label ?director . FILTER(LANG(?director) = "en") }
  OPTIONAL { ?film wdt:P495 ?place . ?place rdfs:label ?country . FILTER(LANG(?country) = "en") }
  OPTIONAL { ?film wdt:P136 ?kind . ?kind rdfs:label ?genre . FILTER(LANG(?genre) = "en") }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  for (const row of rows) {
    const entityId = entityIdFrom(row.film);

    if (!entityId || !row.title) {
      continue;
    }

    const seen = details.get(entityId);
    const genres = seen?.genres ?? [];

    if (row.genre && !genres.includes(row.genre)) {
      genres.push(row.genre);
    }

    details.set(entityId, {
      title: seen?.title ?? row.title,
      year: seen?.year ?? yearFrom(row.date),
      director: seen?.director ?? row.director ?? null,
      country: seen?.country ?? row.country ?? null,
      genres,
    });
  }

  return details;
}

function toCandidate(
  film: ClearedFilm,
  detail: FilmDetail,
  file: CommonsFile,
): WikidataCandidate | null {
  if (isUnsuitable({ title: detail.title, subjects: detail.genres })) {
    return null;
  }

  const authors = `${film.namedAuthors} named author${film.namedAuthors === 1 ? "" : "s"}`;

  return {
    sourceId: film.entityId,
    sourceUrl: file.pageUrl || `https://www.wikidata.org/wiki/${film.entityId}`,
    title: properTitle(detail.title).slice(0, 200),
    year: detail.year,
    director: detail.director?.slice(0, 120) ?? null,
    synopsis: "",
    kind: runtimeKind(file.durationSeconds),
    runtimeSeconds: file.durationSeconds,
    stillUrl: file.thumbnailUrl,
    streamUrl: file.streamUrl,
    streamBytes: file.bytes,
    streamType: file.streamType,
    width: file.width,
    height: file.height,
    country: detail.country,
    rightsBasis: "pd-mark",
    rightsNote: `Wikimedia Commons holds this copy as ${file.licence}, and its ${authors} on Wikidata had all died by ${film.lastDeathYear}`,
    rightsUrl: file.pageUrl || null,
    tags: [
      ...tagList("genre", detail.genres),
      ...tagList("person", [detail.director]),
      ...tagList("holder", ["Wikimedia Commons"]),
    ],
  };
}

export async function searchCommonsFilms(page: number, deathBefore: number) {
  const capped = Math.min(Math.max(1, page), wikidataPageCap());
  const { films, drained } = await readClearedFilms(capped, deathBefore);
  const [details, files] = await Promise.all([
    readDetails(films.map((film) => film.entityId)),
    readCommonsFiles(films.map((film) => film.fileName)),
  ]);
  const candidates = films.flatMap((film) => {
    const detail = details.get(film.entityId);
    const file = files.get(film.fileName);
    const candidate = detail && file ? toCandidate(film, detail, file) : null;

    return candidate ? [candidate] : [];
  });

  return {
    candidates,
    seen: films.length,
    exhausted: drained || capped >= wikidataPageCap(),
  };
}

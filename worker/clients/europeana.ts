import type { RevivalKind, RevivalRightsBasis, RevivalTag } from "../../src/domain/revival.ts";
import { splitSubjects, tagList } from "../lib/revival-tags.ts";
import { firstString, stripMarkup, yearFrom } from "../lib/text.ts";
import { isRecord } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";

const CACHE_TTL = 3_600;

const SEARCH_ENDPOINT = "https://api.europeana.eu/record/v2/search.json";
const RECORD_ORIGIN = "https://www.europeana.eu/en/item";
const TIMEOUT_MS = 25_000;
const PAGE_SIZE = 100;
const PLAYABLE = /\.(mp4|m4v|webm|ogv|mov)(\?|$)/iu;

export const EUROPEANA_COUNTRIES = [
  "United Kingdom",
  "Ireland",
  "Netherlands",
  "Germany",
  "France",
  "Italy",
  "Sweden",
  "Belgium",
  "Denmark",
  "Spain",
] as const;

export function isEuropeanaCountry(value: unknown): value is string {
  return EUROPEANA_COUNTRIES.includes(value as (typeof EUROPEANA_COUNTRIES)[number]);
}

export type EuropeanaCandidate = {
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

function basisFor(rights: string): RevivalRightsBasis | null {
  const value = rights.toLowerCase();

  if (value.includes("publicdomain/zero")) {
    return "cc0";
  }

  return value.includes("publicdomain") ? "eu-institution" : null;
}

function playableUrl(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    if (typeof entry === "string" && entry.startsWith("https://") && PLAYABLE.test(entry)) {
      return entry;
    }
  }

  return null;
}

function mimeFor(url: string) {
  if (/\.webm(\?|$)/iu.test(url)) {
    return "video/webm";
  }

  return /\.ogv(\?|$)/iu.test(url) ? "video/ogg" : "video/mp4";
}

const MAX_SOURCE_ID = 120;

function englishValues(value: unknown) {
  if (!isRecord(value)) {
    return [];
  }

  return Array.isArray(value.en)
    ? value.en.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function recordId(value: string) {
  return value.replace(/^\//u, "").replaceAll("/", "_");
}

export async function searchEuropeana(apiKey: string, country: string, page: number) {
  const url = new URL(SEARCH_ENDPOINT);

  url.searchParams.set("query", "*");
  url.searchParams.set("reusability", "open");
  url.searchParams.set("profile", "rich");
  url.searchParams.set("rows", String(PAGE_SIZE));
  url.searchParams.set("start", String(Math.max(1, (page - 1) * PAGE_SIZE + 1)));
  url.searchParams.append("qf", "TYPE:VIDEO");
  url.searchParams.append("qf", "MEDIA:true");
  url.searchParams.append("qf", `COUNTRY:"${country}"`);

  const response = await upstreamFetch(url, {
    headers: { "x-api-key": apiKey },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });

  if (!response.ok) {
    throw new Error(`Europeana responded ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const empty: EuropeanaCandidate[] = [];

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return { candidates: empty, total: 0 };
  }

  const total = typeof payload.totalResults === "number" ? payload.totalResults : 0;
  const candidates = payload.items.flatMap((item): EuropeanaCandidate[] => {
    if (!isRecord(item)) {
      return [];
    }

    const id = firstString(item.id);
    const title = firstString(item.title);
    const stream = playableUrl(item.edmIsShownBy);
    const rights = firstString(item.rights);
    const basis = basisFor(rights);

    if (!id || !title || !stream || !basis || recordId(id).length > MAX_SOURCE_ID) {
      return [];
    }

    return [
      {
        sourceId: recordId(id),
        sourceUrl: `${RECORD_ORIGIN}${id}`,
        title: title.slice(0, 200),
        year: yearFrom(firstString(item.year)),
        director: firstString(item.dcCreator).slice(0, 120) || null,
        synopsis: stripMarkup(firstString(item.dcDescription)).slice(0, 1_200),
        kind: "ephemeral",
        runtimeSeconds: null,
        stillUrl: firstString(item.edmPreview) || null,
        streamUrl: stream,
        streamBytes: null,
        streamType: mimeFor(stream),
        width: null,
        height: null,
        country: firstString(item.country) || null,
        rightsBasis: basis,
        rightsNote: `${firstString(item.dataProvider) || "A European archive"} published this as ${rights}`,
        rightsUrl: rights || null,
        tags: [
          ...tagList("genre", englishValues(item.edmConceptPrefLabelLangAware)),
          ...tagList("subject", englishValues(item.dcSubjectLangAware)),
          ...tagList("language", splitSubjects(item.language)),
          ...tagList("holder", splitSubjects(item.dataProvider)),
        ],
      },
    ];
  });

  return { candidates, total };
}

import type { RevivalKind, RevivalRightsBasis, RevivalTag } from "../../src/domain/revival.ts";
import { personName, splitSubjects, tagList } from "../lib/revival-tags.ts";
import { firstString, yearFrom } from "../lib/text.ts";
import { isRecord } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";

const CACHE_TTL = 3_600;

const COLLECTION_ENDPOINT = "https://www.loc.gov/collections/national-screening-room/";
const TIMEOUT_MS = 25_000;
const PAGE_SIZE = 40;
const SHORT_MAX_SECONDS = 45 * 60;

const RIGHTS_NOTE =
  "Library of Congress National Screening Room, offered as a free download because the Library is not aware of any US copyright restriction.";

export type LocCandidate = {
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
  rightsBasis: RevivalRightsBasis;
  rightsNote: string;
  rightsUrl: string | null;
  tags: RevivalTag[];
};

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function absoluteUrl(value: string) {
  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  return value.startsWith("https://") ? value : "";
}

function itemIdFrom(url: string) {
  const match = /\/item\/([\w.-]+)\/?$/u.exec(url);

  return match ? match[1] : "";
}

function directorFrom(contributors: unknown) {
  if (!Array.isArray(contributors)) {
    return null;
  }

  const credited = contributors.find(
    (entry) => typeof entry === "string" && /\bdirector\b/iu.test(entry),
  );

  return typeof credited === "string"
    ? credited
        .replace(/,\s*director.*$/iu, "")
        .trim()
        .slice(0, 120)
    : null;
}

function playableResource(resources: unknown) {
  if (!Array.isArray(resources)) {
    return null;
  }

  for (const resource of resources) {
    if (!isRecord(resource) || typeof resource.video !== "string") {
      continue;
    }

    if (!resource.video.startsWith("https://") || !/\.(mp4|m4v)$/iu.test(resource.video)) {
      continue;
    }

    return {
      video: resource.video,
      poster: typeof resource.poster === "string" ? resource.poster : null,
      duration: positiveNumber(resource.duration),
      width: positiveNumber(resource.width),
      height: positiveNumber(resource.height),
    };
  }

  return null;
}

function basisFor(contributors: unknown): RevivalRightsBasis {
  const names = Array.isArray(contributors) ? contributors.join(" ").toLowerCase() : "";

  return names.includes("united states.") ? "us-gov" : "curated";
}

export async function searchScreeningRoom(page: number) {
  const url = new URL(COLLECTION_ENDPOINT);

  url.searchParams.set("fo", "json");
  url.searchParams.set("c", String(PAGE_SIZE));
  url.searchParams.set("sp", String(Math.max(1, page)));
  url.searchParams.set("at", "results,pagination");

  const response = await upstreamFetch(url, { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL });

  if (!response.ok) {
    throw new Error(`Library of Congress responded ${response.status}`);
  }

  const payload = (await response.json()) as unknown;

  const empty: LocCandidate[] = [];

  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return { candidates: empty, hasMore: false };
  }

  const pagination = isRecord(payload.pagination) ? payload.pagination : null;
  const candidates = payload.results.flatMap((result): LocCandidate[] => {
    if (!isRecord(result) || result.access_restricted === true) {
      return [];
    }

    const sourceUrl = firstString(result.id) || firstString(result.url);
    const sourceId = itemIdFrom(sourceUrl);
    const title = firstString(result.title);
    const resource = playableResource(result.resources);

    if (!sourceId || !title || !resource) {
      return [];
    }

    const item = isRecord(result.item) ? result.item : {};
    const runtimeSeconds = resource.duration ? Math.round(resource.duration) : null;

    return [
      {
        sourceId,
        sourceUrl: `https://www.loc.gov/item/${sourceId}/`,
        title: title.slice(0, 200),
        year: yearFrom(firstString(result.date) || firstString(item.date)),
        director: directorFrom(item.contributors),
        synopsis: firstString(result.description) || firstString(item.summary),
        kind: runtimeSeconds !== null && runtimeSeconds <= SHORT_MAX_SECONDS ? "short" : "feature",
        runtimeSeconds,
        stillUrl: absoluteUrl(resource.poster ?? firstString(result.image_url)) || null,
        streamUrl: resource.video,
        streamBytes: null,
        streamType: "video/mp4",
        width: resource.width,
        height: resource.height,
        rightsBasis: basisFor(item.contributors),
        rightsNote: RIGHTS_NOTE,
        rightsUrl: `https://www.loc.gov/item/${sourceId}/`,
        tags: [
          ...tagList("genre", splitSubjects(item.genre)),
          ...tagList("subject", splitSubjects(result.subject)),
          ...tagList(
            "person",
            (Array.isArray(item.contributor_names) ? item.contributor_names : [])
              .filter((entry): entry is string => typeof entry === "string")
              .map(personName),
          ),
          ...tagList("language", splitSubjects(result.language)),
          ...tagList("holder", ["Library of Congress"]),
        ],
      },
    ];
  });

  return { candidates, hasMore: Boolean(firstString(pagination?.next)) };
}

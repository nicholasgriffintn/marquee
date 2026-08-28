import { stripMarkup } from "../lib/text.ts";
import { isRecord, numberAt, positiveNumber, recordAt, stringAt } from "../lib/values.ts";
import { upstreamFetch, UPSTREAM_AGENT } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const API_BASE = "https://commons.wikimedia.org/w/api.php";
const TIMEOUT_MS = 20_000;
const CACHE_TTL = 604_800;
const THUMB_WIDTH = 780;

const FREE_LICENCES = new Set(["pd", "cc0"]);

const STREAMABLE: Record<string, string> = {
  "video/webm": "video/webm",
  "video/ogg": "video/ogg",
  "video/mp4": "video/mp4",
  "application/ogg": "video/ogg",
};

export const CommonsError = upstreamError("CommonsError");

export type CommonsFile = {
  name: string;
  pageUrl: string;
  streamUrl: string;
  streamType: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  licence: string;
  author: string | null;
};

export function commonsFileName(url: string) {
  const match = /\/Special:FilePath\/(.+)$/u.exec(url);

  return match ? decodeURIComponent(match[1]).replaceAll("_", " ") : null;
}

function withoutTracking(value: string | null) {
  if (!value) {
    return null;
  }

  const url = new URL(value);

  url.search = "";

  return url.toString();
}

function metadataValue(extra: Record<string, unknown> | null, key: string) {
  const entry = extra ? recordAt(extra, key) : null;

  return entry ? stringAt(entry, "value") : null;
}

function toFile(name: string, info: Record<string, unknown>): CommonsFile | null {
  const extra = recordAt(info, "extmetadata");
  const licence = metadataValue(extra, "License");
  const label = metadataValue(extra, "LicenseShortName");
  const streamUrl = withoutTracking(stringAt(info, "url"));
  const streamType = STREAMABLE[stringAt(info, "mime") ?? ""];

  if (!streamUrl || !streamType || !licence || !FREE_LICENCES.has(licence.toLowerCase())) {
    return null;
  }

  const author = stripMarkup(metadataValue(extra, "Artist") ?? "");
  const duration = numberAt(info, "duration");

  return {
    name,
    pageUrl: stringAt(info, "descriptionurl") ?? "",
    streamUrl,
    streamType,
    bytes: positiveNumber(info.size),
    width: positiveNumber(info.width),
    height: positiveNumber(info.height),
    durationSeconds: duration === null || duration <= 0 ? null : Math.round(duration),
    thumbnailUrl: withoutTracking(stringAt(info, "thumburl")),
    licence: label ?? "Public domain",
    author: author.slice(0, 200) || null,
  };
}

export async function readCommonsFiles(names: string[]) {
  const found = new Map<string, CommonsFile>();

  if (names.length === 0) {
    return found;
  }

  const url = new URL(API_BASE);

  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiextmetadatafilter: "License|LicenseShortName|Artist",
    iiurlwidth: String(THUMB_WIDTH),
    titles: names.map((name) => `File:${name}`).join("|"),
  }).toString();

  const response = await upstreamFetch(url, {
    headers: { "user-agent": UPSTREAM_AGENT },
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
  });

  if (!response.ok) {
    throw new CommonsError(`Commons lookup failed (${response.status})`, response.status);
  }

  const payload = await response.json();
  const pages = recordAt(recordAt(payload, "query") ?? {}, "pages");

  for (const page of Object.values(pages ?? {})) {
    const title = isRecord(page) ? stringAt(page, "title") : null;
    const [info] = isRecord(page) && Array.isArray(page.imageinfo) ? page.imageinfo : [];

    if (!title || !isRecord(info)) {
      continue;
    }

    const name = title.replace(/^File:/u, "");
    const file = toFile(name, info);

    if (file) {
      found.set(name, file);
    }
  }

  return found;
}

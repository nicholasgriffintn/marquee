import type { TitleVideo } from "../../src/domain/catalog.ts";
import { isRecord, numberAt, stringAt, stringList } from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const API_BASE = "https://api.kinocheck.com";
const TIMEOUT_MS = 12_000;
const CACHE_TTL = 900;
const NAME_LIMIT = 80;
const VIDEO_TYPES = ["Trailer", "Teaser", "Clip", "Featurette"];

export const KINOCHECK_PAGE_SIZE = 100;

export const KinoCheckError = upstreamError("KinoCheckError");

export type KinoCheckFeed = "latest" | "trending";

export type KinoCheckTrailer = TitleVideo & {
  titleId: string;
  publishedAt: string;
  views: number;
};

function parseTrailer(value: unknown): KinoCheckTrailer | null {
  if (!isRecord(value)) {
    return null;
  }

  const resource = isRecord(value.resource) ? value.resource : null;
  const tmdbId = resource ? numberAt(resource, "tmdb_id") : null;
  const kind = resource ? stringAt(resource, "type") : null;
  const key = stringAt(value, "youtube_video_id");
  const published = stringAt(value, "published");
  const categories = stringList(value.categories, { limit: 8 });
  const type = VIDEO_TYPES.find((candidate) => categories.includes(candidate));

  if (
    !key ||
    !type ||
    !published ||
    !Number.isFinite(Date.parse(published)) ||
    !tmdbId ||
    !Number.isInteger(tmdbId) ||
    tmdbId <= 0 ||
    (kind !== "movie" && kind !== "show")
  ) {
    return null;
  }

  return {
    titleId: `${kind === "movie" ? "movie" : "tv"}:${tmdbId}`,
    key,
    name: (stringAt(value, "title") ?? type).slice(0, NAME_LIMIT),
    type,
    publishedAt: new Date(published).toISOString(),
    views: Math.max(0, Math.trunc(numberAt(value, "views") ?? 0)),
    source: "kinocheck",
  };
}

function entriesOf(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return isRecord(payload)
    ? Object.entries(payload)
        .filter(([entry]) => entry !== "_metadata")
        .map(([, value]) => value)
    : [];
}

export async function getKinoCheckTrailers(env: Bindings, feed: KinoCheckFeed, page: number) {
  const url = new URL(`${API_BASE}/trailers/${feed}`);

  url.search = new URLSearchParams({
    language: "en",
    limit: String(KINOCHECK_PAGE_SIZE),
    page: String(page),
  }).toString();

  const response = await upstreamFetch(url, {
    source: "kinocheck",
    timeoutMs: TIMEOUT_MS,
    cacheTtl: CACHE_TTL,
    headers: {
      "x-api-host": "api.kinocheck.com",
      ...(env.KINOCHECK_API_KEY ? { "x-api-key": env.KINOCHECK_API_KEY } : {}),
    },
  });

  if (!response.ok) {
    throw new KinoCheckError(`KinoCheck returned ${response.status}`, response.status);
  }

  return entriesOf(await response.json())
    .map(parseTrailer)
    .filter((trailer): trailer is KinoCheckTrailer => trailer !== null);
}

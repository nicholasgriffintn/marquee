import type { ExternalIds, MediaType } from "../../src/domain/catalog.ts";
import { isRecord, numberAt, stringAt } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const LIST_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json";
const TIMEOUT_MS = 60_000;
const CACHE_TTL = 21_600;

export const FribbError = upstreamError("FribbError");

export type AnimeMapping = { titleId: string; ids: ExternalIds };

const NUMBER_IDS = [
  ["mal_id", "malId"],
  ["anilist_id", "anilistId"],
  ["anidb_id", "anidbId"],
  ["kitsu_id", "kitsuId"],
  ["anisearch_id", "aniSearchId"],
  ["livechart_id", "livechartId"],
  ["animenewsnetwork_id", "animeNewsNetworkId"],
  ["animecountdown_id", "animeCountdownId"],
  ["simkl_id", "simklId"],
  ["tvdb_id", "tvdbId"],
] as const;

function titleIds(value: unknown) {
  const empty: string[] = [];

  if (!isRecord(value)) {
    return empty;
  }

  return Object.entries(value).flatMap(([kind, id]) => {
    const mediaType: MediaType | null = kind === "movie" ? "movie" : kind === "tv" ? "tv" : null;
    const tmdbId = typeof id === "number" && Number.isFinite(id) ? id : null;

    return mediaType && tmdbId ? [`${mediaType}:${tmdbId}`] : [];
  });
}

function idsFrom(entry: Record<string, unknown>): ExternalIds {
  const ids: ExternalIds = {};

  for (const [source, field] of NUMBER_IDS) {
    const value = numberAt(entry, source);

    if (value !== null) {
      Object.assign(ids, { [field]: value });
    }
  }

  const planet = stringAt(entry, "anime-planet_id");

  if (planet) {
    ids.animePlanetId = planet;
  }

  const [imdbId] = Array.isArray(entry.imdb_id) ? entry.imdb_id : [];

  if (typeof imdbId === "string" && /^tt\d+$/u.test(imdbId)) {
    ids.imdbId = imdbId;
  }

  return ids;
}

export async function readAnimeListVersion() {
  const response = await upstreamFetch(LIST_URL, { timeoutMs: TIMEOUT_MS, method: "HEAD" });

  if (!response.ok) {
    throw new FribbError(`Anime list version check failed (${response.status})`, response.status);
  }

  const tag = response.headers.get("etag");

  if (!tag) {
    throw new FribbError("Anime list carried no version", 502);
  }

  return tag.replaceAll('"', "").slice(0, 80);
}

export async function readAnimeMappings(): Promise<AnimeMapping[]> {
  const response = await upstreamFetch(LIST_URL, { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL });

  if (!response.ok) {
    throw new FribbError(`Anime list request failed (${response.status})`, response.status);
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new FribbError("Anime list was not a list", 502);
  }

  const byTitle = new Map<string, AnimeMapping>();

  for (const entry of payload) {
    if (!isRecord(entry)) {
      continue;
    }

    const ids = idsFrom(entry);

    if (Object.keys(ids).length === 0) {
      continue;
    }

    for (const titleId of titleIds(entry.themoviedb_id)) {
      byTitle.set(titleId, { titleId, ids: { ...ids, ...byTitle.get(titleId)?.ids } });
    }
  }

  return [...byTitle.values()];
}

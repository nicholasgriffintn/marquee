import {
  boundedString,
  calendarDate,
  numberAt,
  recordAt,
  records,
  stringAt,
  stringList,
} from "../lib/values.ts";
import type { Bindings } from "../types.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const MIN_GAP_MS = 1_200;
const API_BASE = "https://api.myanimelist.net/v2/anime";
const FIELDS = [
  "title",
  "main_picture",
  "alternative_titles",
  "end_date",
  "mean",
  "rank",
  "popularity",
  "num_list_users",
  "num_scoring_users",
  "num_favorites",
  "media_type",
  "status",
  "genres",
  "num_episodes",
  "start_season",
  "broadcast",
  "source",
  "average_episode_duration",
  "background",
  "related_anime",
  "studios",
  "opening_themes",
  "ending_themes",
  "videos",
  "rating",
  "statistics",
  "recommendations",
].join(",");

const SYNONYM_LIMIT = 8;
const RELATION_LIMIT = 12;
const RECOMMENDATION_LIMIT = 12;
const TAG_LIMIT = 15;
const THEME_LIMIT = 12;
const BACKGROUND_LIMIT = 900;

const RELATION_LABELS: Record<string, string> = {
  prequel: "Prequel",
  sequel: "Sequel",
  side_story: "Side story",
  parent_story: "Parent story",
  alternative_version: "Alternative version",
  alternative_setting: "Alternative setting",
  summary: "Summary",
  spin_off: "Spin-off",
};

const FORMAT_LABELS: Record<string, string> = {
  tv: "TV",
  ova: "OVA",
  movie: "Movie",
  special: "Special",
  ona: "ONA",
  music: "Music",
};

const SOURCE_LABELS: Record<string, string> = {
  original: "Original",
  manga: "Manga",
  "4_koma_manga": "4-koma manga",
  web_manga: "Web manga",
  novel: "Novel",
  light_novel: "Light novel",
  visual_novel: "Visual novel",
  game: "Game",
  picture_book: "Picture book",
};

const STATUS_LABELS: Record<string, string> = {
  finished_airing: "Finished Airing",
  currently_airing: "Currently Airing",
  not_yet_aired: "Not yet aired",
};

const RATING_LABELS: Record<string, string> = {
  g: "G",
  pg: "PG",
  pg_13: "PG-13",
  r: "R - 17+",
  "r+": "R+ - Mild Nudity",
  rx: "Rx - Hentai",
};

const DAY_LABELS: Record<string, string> = {
  monday: "Mondays",
  tuesday: "Tuesdays",
  wednesday: "Wednesdays",
  thursday: "Thursdays",
  friday: "Fridays",
  saturday: "Saturdays",
  sunday: "Sundays",
};

export const MalError = upstreamError("MalError");

export type AnimeRelation = {
  malId: number;
  relation: string;
  format: string | null;
  title: string;
  year: number | null;
};

export type AnimeTheme = {
  title: string;
  artist: string | null;
  episodes: string | null;
};

export type AnimeVideo = {
  key: string;
  name: string;
};

export type AnimeStatusBreakdown = {
  watching: number;
  completed: number;
  onHold: number;
  dropped: number;
  planToWatch: number;
};

export type MalAnimeDetails = {
  score: number | null;
  scoredBy: number | null;
  status: string | null;
  rating: string | null;
  airedTo: string | null;
  background: string | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  keyVisualUrl: string | null;
  videos: AnimeVideo[];
  statusBreakdown: AnimeStatusBreakdown | null;
  tags: string[];
  studios: string[];
  broadcast: string | null;
  anime: {
    format: string | null;
    airing: boolean;
    episodes: number | null;
    durationMinutes: number | null;
    season: string | null;
    seasonYear: number | null;
    source: string | null;
    synonyms: string[];
    romajiTitle: string | null;
    englishTitle: string | null;
    nativeTitle: string | null;
    relations: AnimeRelation[];
    recommendations: number[];
    openings: AnimeTheme[];
    endings: AnimeTheme[];
  };
};

const THEME_PATTERN =
  /^(?:#?\d+:?\s*)?"?(?<title>[^"]+?)"?(?:\s+by\s+(?<artist>.+?))?(?:\s*\((?<episodes>eps?[^)]*)\))?$/u;

function parseTheme(entry: string): AnimeTheme {
  const found = THEME_PATTERN.exec(entry.trim())?.groups;

  return {
    title: found?.title?.trim() || entry,
    artist: found?.artist?.trim() || null,
    episodes: found?.episodes?.replace(/^eps?\s*/u, "").trim() || null,
  };
}

function themeList(value: unknown) {
  return records(value)
    .flatMap((entry) => {
      const text = stringAt(entry, "text");

      return text ? [text] : [];
    })
    .slice(0, THEME_LIMIT)
    .map(parseTheme);
}

const YOUTUBE_URL = /(?:youtu\.be\/|[?&]v=)([\w-]{6,})/u;
const VIDEO_LIMIT = 6;

function videosOf(value: unknown): AnimeVideo[] {
  const seen = new Set<string>();

  return records(value)
    .flatMap((entry): AnimeVideo[] => {
      const url = stringAt(entry, "url");
      const key = url ? YOUTUBE_URL.exec(url)?.[1] : null;

      if (!key || seen.has(key)) {
        return [];
      }

      seen.add(key);

      return [{ key, name: stringAt(entry, "title") || "Trailer" }];
    })
    .slice(0, VIDEO_LIMIT);
}

function countAt(value: Record<string, unknown> | null, key: string) {
  const raw = value?.[key];
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function statusBreakdownOf(
  status: Record<string, unknown> | null,
): AnimeStatusBreakdown | null {
  if (!status) {
    return null;
  }

  return {
    watching: countAt(status, "watching"),
    completed: countAt(status, "completed"),
    onHold: countAt(status, "on_hold"),
    dropped: countAt(status, "dropped"),
    planToWatch: countAt(status, "plan_to_watch"),
  };
}

function broadcastLabel(broadcast: Record<string, unknown> | null) {
  const day = broadcast ? stringAt(broadcast, "day_of_the_week") : null;
  const time = broadcast ? stringAt(broadcast, "start_time") : null;
  const dayLabel = day ? DAY_LABELS[day] : null;

  return dayLabel && time ? `${dayLabel} at ${time} (JST)` : null;
}

function namesOf(value: unknown, limit: number) {
  return records(value)
    .flatMap((entry) => {
      const name = stringAt(entry, "name");

      return name ? [name] : [];
    })
    .slice(0, limit);
}

export async function getMalAnimeDetails(
  env: Bindings,
  malId: number,
): Promise<MalAnimeDetails | null> {
  if (!env.MAL_CLIENT_ID) {
    throw new MalError("MyAnimeList is not configured", 503);
  }

  await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));

  const url = new URL(`${API_BASE}/${malId}`);

  url.search = new URLSearchParams({ fields: FIELDS }).toString();

  const response = await upstreamFetch(url, {
    timeoutMs: TIMEOUT_MS,
    headers: { "X-MAL-CLIENT-ID": env.MAL_CLIENT_ID },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    throw new MalError(
      `MyAnimeList request failed (${response.status}) ${body.slice(0, 180).replaceAll(/\s+/gu, " ")}`,
      response.status,
    );
  }

  const media = await response.json();

  if (!media || typeof media !== "object") {
    throw new MalError("MyAnimeList returned a payload without anime data");
  }

  const record = media as Record<string, unknown>;
  const alternativeTitles = recordAt(record, "alternative_titles");
  const startSeason = recordAt(record, "start_season");
  const mediaType = stringAt(record, "media_type");
  const status = stringAt(record, "status");
  const source = stringAt(record, "source");
  const averageEpisodeDuration = numberAt(record, "average_episode_duration");
  const mainPicture = recordAt(record, "main_picture");
  const rating = stringAt(record, "rating");
  const statistics = recordAt(record, "statistics");

  return {
    score: numberAt(record, "mean"),
    scoredBy: numberAt(record, "num_scoring_users"),
    status: status ? (STATUS_LABELS[status] ?? status) : null,
    rating: rating ? (RATING_LABELS[rating] ?? rating) : null,
    airedTo: calendarDate(record.end_date),
    background: boundedString(record.background, BACKGROUND_LIMIT),
    rank: numberAt(record, "rank"),
    popularity: numberAt(record, "popularity"),
    members: numberAt(record, "num_list_users"),
    favorites: numberAt(record, "num_favorites"),
    videos: videosOf(record.videos),
    statusBreakdown: statusBreakdownOf(
      statistics ? recordAt(statistics, "status") : null,
    ),
    keyVisualUrl: mainPicture
      ? (stringAt(mainPicture, "large") ?? stringAt(mainPicture, "medium"))
      : null,
    tags: namesOf(record.genres, TAG_LIMIT).map((name) => name.toLowerCase()),
    studios: namesOf(record.studios, 3),
    broadcast: broadcastLabel(recordAt(record, "broadcast")),
    anime: {
      format: mediaType ? (FORMAT_LABELS[mediaType] ?? null) : null,
      airing: status === "currently_airing",
      episodes: numberAt(record, "num_episodes") || null,
      durationMinutes: averageEpisodeDuration
        ? Math.round(averageEpisodeDuration / 60)
        : null,
      season: startSeason
        ? (stringAt(startSeason, "season")?.toUpperCase() ?? null)
        : null,
      seasonYear: startSeason ? numberAt(startSeason, "year") : null,
      source: source ? (SOURCE_LABELS[source] ?? source) : null,
      synonyms: alternativeTitles
        ? stringList(alternativeTitles.synonyms, { limit: SYNONYM_LIMIT })
        : [],
      romajiTitle: stringAt(record, "title"),
      englishTitle: alternativeTitles
        ? stringAt(alternativeTitles, "en")
        : null,
      nativeTitle: alternativeTitles ? stringAt(alternativeTitles, "ja") : null,
      openings: themeList(record.opening_themes),
      endings: themeList(record.ending_themes),
      relations: records(record.related_anime)
        .flatMap((edge): AnimeRelation[] => {
          const relationType = stringAt(edge, "relation_type");
          const label = relationType ? RELATION_LABELS[relationType] : null;
          const node = recordAt(edge, "node");
          const malEntryId = node ? numberAt(node, "id") : null;
          const title = node ? stringAt(node, "title") : null;

          if (!label || !malEntryId || !title) {
            return [];
          }

          return [
            {
              malId: malEntryId,
              relation: label,
              format: null,
              title,
              year: null,
            },
          ];
        })
        .slice(0, RELATION_LIMIT),
      recommendations: records(record.recommendations)
        .flatMap((entry) => {
          const node = recordAt(entry, "node");
          const malEntryId = node ? numberAt(node, "id") : null;

          return malEntryId ? [malEntryId] : [];
        })
        .slice(0, RECOMMENDATION_LIMIT),
    },
  };
}

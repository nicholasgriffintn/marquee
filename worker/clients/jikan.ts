import { boundedString, numberAt, records, recordAt, stringAt, stringList } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const MIN_GAP_MS = 1_200;
const API_BASE = "https://api.jikan.moe/v4/anime";

const SYNONYM_LIMIT = 8;
const RELATION_LIMIT = 12;
const STREAM_LIMIT = 12;
const TAG_LIMIT = 15;
const THEME_LIMIT = 12;
const LICENSOR_LIMIT = 3;
const PRODUCER_LIMIT = 4;
const LINK_LIMIT = 6;
const BACKGROUND_LIMIT = 900;

const WATCH_ORDER = new Set([
  "Prequel",
  "Sequel",
  "Side story",
  "Parent story",
  "Alternative version",
  "Alternative setting",
  "Summary",
  "Spin-off",
]);

export const JikanError = upstreamError("JikanError");

export type AnimeRelation = {
  malId: number;
  relation: string;
  format: string | null;
  title: string;
  year: number | null;
};

export type AnimeLink = {
  name: string;
  url: string;
};

export type AnimeTheme = {
  title: string;
  artist: string | null;
  episodes: string | null;
};

export type AnimeStream = {
  site: string;
  url: string;
};

export type JikanDetails = {
  score: number | null;
  scoredBy: number | null;
  status: string | null;
  airedTo: string | null;
  background: string | null;
  licensors: string[];
  producers: string[];
  rank: number | null;
  members: number | null;
  favorites: number | null;
  trailerKey: string | null;
  keyVisualUrl: string | null;
  links: AnimeLink[];
  tags: string[];
  studios: string[];
  broadcast: string | null;
  anime: {
    format: string | null;
    airing: boolean;
    openings: AnimeTheme[];
    endings: AnimeTheme[];
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
    streams: AnimeStream[];
  };
};

function minutesFrom(duration: string | null) {
  const match = duration ? /(\d+)\s*min/u.exec(duration) : null;

  return match ? Number(match[1]) : null;
}

const THEME_PATTERN =
  /^(?:\d+:\s*)?"?(?<title>[^"]+?)"?(?:\s+by\s+(?<artist>.+?))?(?:\s*\((?<episodes>eps?[^)]*)\))?$/u;

function parseTheme(entry: string): AnimeTheme {
  const found = THEME_PATTERN.exec(entry.trim())?.groups;

  return {
    title: found?.title?.trim() || entry,
    artist: found?.artist?.trim() || null,
    episodes: found?.episodes?.replace(/^eps?\s*/u, "").trim() || null,
  };
}

function trailerKeyOf(trailer: Record<string, unknown> | null) {
  const direct = trailer ? stringAt(trailer, "youtube_id") : null;

  if (direct) {
    return direct;
  }

  const embed = trailer ? stringAt(trailer, "embed_url") : null;

  return embed ? /\/embed\/([\w-]{6,})/u.exec(embed)?.[1] || null : null;
}

function namesOf(value: unknown, limit: number) {
  return records(value)
    .flatMap((entry) => {
      const name = stringAt(entry, "name");

      return name ? [name] : [];
    })
    .slice(0, limit);
}

function themeList(theme: Record<string, unknown> | null, key: string) {
  return theme
    ? stringList(theme[key], { limit: THEME_LIMIT, itemLength: 200 }).map(parseTheme)
    : [];
}

function titleOfType(media: Record<string, unknown>, kind: string) {
  const found = records(media.titles).find((entry) => stringAt(entry, "type") === kind);

  return found ? stringAt(found, "title") : null;
}

export async function getJikanDetails(malId: number): Promise<JikanDetails | null> {
  await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));

  const response = await upstreamFetch(`${API_BASE}/${malId}/full`, { timeoutMs: TIMEOUT_MS });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    throw new JikanError(
      `Jikan request failed (${response.status}) ${body.slice(0, 180).replaceAll(/\s+/gu, " ")}`,
      response.status,
    );
  }

  const payload = await response.json();
  const media = recordAt(payload, "data");

  if (!media) {
    throw new JikanError("Jikan returned a payload without anime data");
  }

  const broadcast = recordAt(media, "broadcast");
  const season = stringAt(media, "season");

  const theme = recordAt(media, "theme");

  return {
    score: numberAt(media, "score"),
    scoredBy: numberAt(media, "scored_by"),
    status: stringAt(media, "status"),
    background: boundedString(media.background, BACKGROUND_LIMIT) || null,
    licensors: namesOf(media.licensors, LICENSOR_LIMIT),
    producers: namesOf(media.producers, PRODUCER_LIMIT),
    rank: numberAt(media, "rank"),
    members: numberAt(media, "members"),
    favorites: numberAt(media, "favorites"),
    trailerKey: trailerKeyOf(recordAt(media, "trailer")),
    keyVisualUrl: stringAt(
      recordAt(recordAt(media, "images") ?? {}, "jpg") ?? {},
      "large_image_url",
    ),
    links: records(media.external)
      .flatMap((entry): AnimeLink[] => {
        const name = stringAt(entry, "name");
        const url = stringAt(entry, "url");

        return name && url && url.startsWith("http") ? [{ name, url }] : [];
      })
      .slice(0, LINK_LIMIT),
    airedTo: stringAt(recordAt(media, "aired") ?? {}, "to")?.slice(0, 10) ?? null,
    tags: [...records(media.genres), ...records(media.themes), ...records(media.demographics)]
      .map((entry) => stringAt(entry, "name"))
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase())
      .slice(0, TAG_LIMIT),
    studios: records(media.studios)
      .map((entry) => stringAt(entry, "name"))
      .filter((name): name is string => Boolean(name))
      .slice(0, 3),
    broadcast: broadcast ? stringAt(broadcast, "string") : null,
    anime: {
      format: stringAt(media, "type"),
      airing: media.airing === true,
      openings: themeList(theme, "openings"),
      endings: themeList(theme, "endings"),
      episodes: numberAt(media, "episodes"),
      durationMinutes: minutesFrom(stringAt(media, "duration")),
      season: season ? season.toUpperCase() : null,
      seasonYear: numberAt(media, "year"),
      source: stringAt(media, "source"),
      synonyms: records(media.titles)
        .filter((entry) => stringAt(entry, "type") === "Synonym")
        .map((entry) => stringAt(entry, "title"))
        .filter((name): name is string => typeof name === "string" && name.length > 1)
        .slice(0, SYNONYM_LIMIT),
      romajiTitle: titleOfType(media, "Default"),
      englishTitle: titleOfType(media, "English"),
      nativeTitle: titleOfType(media, "Japanese"),
      relations: records(media.relations)
        .flatMap((edge): AnimeRelation[] => {
          const relation = stringAt(edge, "relation");
          const [entry] = records(edge.entry);
          const malEntryId = entry ? numberAt(entry, "mal_id") : null;
          const name = entry ? stringAt(entry, "name") : null;

          if (!relation || !malEntryId || !name || !WATCH_ORDER.has(relation)) {
            return [];
          }

          return [{ malId: malEntryId, relation, format: null, title: name, year: null }];
        })
        .slice(0, RELATION_LIMIT),
      streams: records(media.streaming)
        .flatMap((entry): AnimeStream[] => {
          const site = stringAt(entry, "name");
          const url = stringAt(entry, "url");

          return site && url ? [{ site, url }] : [];
        })
        .slice(0, STREAM_LIMIT),
    },
  };
}

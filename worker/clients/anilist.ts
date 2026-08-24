import { numberAt, records, recordAt, stringAt } from "../lib/values.ts";
import { upstreamFetch } from "./fetch.ts";
import { upstreamError } from "./upstream.ts";

const TIMEOUT_MS = 12_000;
const MIN_GAP_MS = 3_000;

const API_BASE = "https://graphql.anilist.co";

const SYNONYM_LIMIT = 8;
const RELATION_LIMIT = 12;
const STREAM_LIMIT = 10;

const WATCH_ORDER = new Set([
  "PREQUEL",
  "SEQUEL",
  "SIDE_STORY",
  "PARENT",
  "ALTERNATIVE",
  "SUMMARY",
  "SPIN_OFF",
]);

const QUERY = `query ($id: Int) {
  Media(id: $id) {
    averageScore
    genres
    tags { name rank isGeneralSpoiler }
    nextAiringEpisode { airingAt episode }
    studios(isMain: true) { nodes { name } }
    format
    episodes
    duration
    season
    seasonYear
    source
    countryOfOrigin
    synonyms
    title { romaji english native }
    relations {
      edges {
        relationType(version: 2)
        node { id type format title { romaji english } startDate { year } }
      }
    }
    externalLinks { site url type language }
  }
}`;

export const AnilistError = upstreamError("AnilistError");

export type AnimeRelation = {
  anilistId: number;
  relation: string;
  format: string | null;
  title: string;
  year: number | null;
};

export type AnimeStream = {
  site: string;
  url: string;
  language: string | null;
};

export type AnilistDetails = {
  score: number | null;
  tags: string[];
  studios: string[];
  nextEpisode: { airsAt: string; episode: number } | null;
  anime: {
    format: string | null;
    episodes: number | null;
    durationMinutes: number | null;
    season: string | null;
    seasonYear: number | null;
    source: string | null;
    country: string | null;
    synonyms: string[];
    romajiTitle: string | null;
    englishTitle: string | null;
    nativeTitle: string | null;
    relations: AnimeRelation[];
    streams: AnimeStream[];
  };
};

export async function getAnilistDetails(anilistId: number): Promise<AnilistDetails | null> {
  await new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));

  const response = await upstreamFetch(API_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { id: anilistId } }),
    timeoutMs: TIMEOUT_MS,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    throw new AnilistError(
      `AniList request failed (${response.status}) ${body.slice(0, 180).replaceAll(/\s+/gu, " ")}`,
      response.status,
    );
  }

  const payload = await response.json();
  const media = recordAt(recordAt(payload, "data"), "Media");

  if (!media) {
    return null;
  }

  const airing = recordAt(media, "nextAiringEpisode");
  const titles = recordAt(media, "title");
  const airingAt = airing ? numberAt(airing, "airingAt") : null;
  const episode = airing ? numberAt(airing, "episode") : null;

  return {
    score: numberAt(media, "averageScore"),
    tags: records(media.tags)
      .filter((tag) => (numberAt(tag, "rank") ?? 0) >= 60 && tag.isGeneralSpoiler !== true)
      .map((tag) => stringAt(tag, "name"))
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase())
      .slice(0, 15),
    studios: records(recordAt(media, "studios")?.nodes)
      .map((node) => stringAt(node, "name"))
      .filter((name): name is string => Boolean(name))
      .slice(0, 3),
    nextEpisode:
      airingAt && episode ? { airsAt: new Date(airingAt * 1_000).toISOString(), episode } : null,
    anime: {
      format: stringAt(media, "format"),
      episodes: numberAt(media, "episodes"),
      durationMinutes: numberAt(media, "duration"),
      season: stringAt(media, "season"),
      seasonYear: numberAt(media, "seasonYear"),
      source: stringAt(media, "source"),
      country: stringAt(media, "countryOfOrigin"),
      synonyms: Array.isArray(media.synonyms)
        ? media.synonyms
            .filter((name): name is string => typeof name === "string" && name.length > 1)
            .slice(0, SYNONYM_LIMIT)
        : [],
      romajiTitle: titles ? stringAt(titles, "romaji") : null,
      englishTitle: titles ? stringAt(titles, "english") : null,
      nativeTitle: titles ? stringAt(titles, "native") : null,
      relations: records(recordAt(media, "relations")?.edges)
        .flatMap((edge): AnimeRelation[] => {
          const node = recordAt(edge, "node");
          const anilistId = node ? numberAt(node, "id") : null;
          const relation = stringAt(edge, "relationType");
          const started = node ? recordAt(node, "startDate") : null;
          const names = node ? recordAt(node, "title") : null;
          const name = names ? (stringAt(names, "english") ?? stringAt(names, "romaji")) : null;

          if (!anilistId || !relation || !name || !WATCH_ORDER.has(relation)) {
            return [];
          }

          return [
            {
              anilistId,
              relation,
              format: node ? stringAt(node, "format") : null,
              title: name,
              year: started ? numberAt(started, "year") : null,
            },
          ];
        })
        .slice(0, RELATION_LIMIT),
      streams: records(media.externalLinks)
        .flatMap((link): AnimeStream[] => {
          const site = stringAt(link, "site");
          const url = stringAt(link, "url");

          if (!site || !url || stringAt(link, "type") !== "STREAMING") {
            return [];
          }

          return [{ site, url, language: stringAt(link, "language") }];
        })
        .slice(0, STREAM_LIMIT),
    },
  };
}

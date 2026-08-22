import { numberAt, records, recordAt, stringAt } from "../lib/values.ts";

const API_BASE = "https://graphql.anilist.co";

const QUERY = `query ($id: Int) {
  Media(id: $id) {
    averageScore
    genres
    tags { name rank isGeneralSpoiler }
    nextAiringEpisode { airingAt episode }
    studios(isMain: true) { nodes { name } }
  }
}`;

export class AnilistError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "AnilistError";
  }
}

export type AnilistDetails = {
  score: number | null;
  tags: string[];
  studios: string[];
  nextEpisode: { airsAt: string; episode: number } | null;
};

export async function getAnilistDetails(anilistId: number): Promise<AnilistDetails | null> {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { id: anilistId } }),
    signal: AbortSignal.timeout(12_000),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new AnilistError(`AniList request failed (${response.status})`, response.status);
  }

  const payload = await response.json();
  const media = recordAt(recordAt(payload, "data"), "Media");

  if (!media) {
    return null;
  }

  const airing = recordAt(media, "nextAiringEpisode");
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
  };
}

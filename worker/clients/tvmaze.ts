import { numberAt, records, recordAt, stringAt } from "../lib/values.ts";

const API_BASE = "https://api.tvmaze.com";

export class TvmazeError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "TvmazeError";
  }
}

export type ScheduledEpisode = {
  id: string;
  imdbId: string | null;
  showName: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  airsAt: string;
  network: string | null;
};

function airstamp(episode: Record<string, unknown>) {
  const stamp = stringAt(episode, "airstamp");

  if (stamp && !Number.isNaN(Date.parse(stamp))) {
    return new Date(stamp).toISOString();
  }

  const date = stringAt(episode, "airdate");

  return date && /^\d{4}-\d{2}-\d{2}$/u.test(date) ? `${date}T00:00:00.000Z` : null;
}

function networkName(show: Record<string, unknown>) {
  const network = recordAt(show, "webChannel") ?? recordAt(show, "network");

  return network ? stringAt(network, "name") : null;
}

function scheduleUrl(countryCode: string | null, date: string) {
  const url = new URL(`${API_BASE}/schedule${countryCode ? "" : "/web"}`);

  url.search = new URLSearchParams(
    countryCode ? { country: countryCode, date } : { date },
  ).toString();

  return url;
}

export async function getTvmazeSchedule(countryCode: string | null, date: string) {
  const url = scheduleUrl(countryCode, date);

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cf: { cacheEverything: true, cacheTtl: 3_600 },
  });

  if (!response.ok) {
    throw new TvmazeError(`TVmaze request failed (${response.status})`, response.status);
  }

  const payload = await response.json();

  return records(payload).flatMap((episode): ScheduledEpisode[] => {
    const show = recordAt(episode, "show") ?? recordAt(recordAt(episode, "_embedded"), "show");
    const showName = show ? stringAt(show, "name") : null;
    const airsAt = airstamp(episode);
    const id = numberAt(episode, "id");

    if (!show || !showName || !airsAt || !id) {
      return [];
    }

    const externals = recordAt(show, "externals");

    return [
      {
        id: `tvmaze:${id}`,
        imdbId: externals ? stringAt(externals, "imdb") : null,
        showName,
        season: numberAt(episode, "season"),
        episode: numberAt(episode, "number"),
        episodeName: stringAt(episode, "name"),
        airsAt,
        network: networkName(show),
      },
    ];
  });
}

import { formatDate } from "../lib/dates";

export type SeasonSummary = {
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  episodeCount: number;
  posterUrl: string | null;
};

export type Episode = {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  runtimeMinutes: number | null;
  stillUrl: string | null;
  tmdbScore: number | null;
  tmdbVoteCount: number;
  imdbId?: string | null;
  imdbScore?: number | null;
};

export type SeasonDetail = SeasonSummary & {
  episodes: Episode[];
  source: "TMDB";
  fetchedAt: string;
};

export type EntryScope = "season" | "episode";

export type EpisodeEntry = {
  titleId: string;
  scope: EntryScope;
  season: number;
  episode: number;
  watched: boolean;
  watchedAt: string | null;
  rating: number | null;
  notes: string;
  updatedAt: string;
};

export type SeasonProgress = {
  season: number;
  episodes: number;
  aired: number;
  watched: number;
  rated: number;
  noted: number;
  averageRating: number | null;
};

export type ShowProgress = {
  titleId: string;
  watched: number;
  aired: number;
  seasons: SeasonProgress[];
  furthest: { season: number; episode: number } | null;
  upNext: { season: number; episode: number } | null;
};

export const SEASON_ENTRY_EPISODE = 0;

export function entryKey(scope: EntryScope, season: number, episode: number) {
  return `${scope}:${season}:${scope === "season" ? SEASON_ENTRY_EPISODE : episode}`;
}

export function episodeLabel(season: number, episode: number) {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

export function seasonLabel(season: number, name?: string) {
  if (season === 0) {
    return name && name !== "Specials" ? name : "Specials";
  }

  return name && !/^season\s+\d+$/iu.test(name) ? `Series ${season} · ${name}` : `Series ${season}`;
}

export function hasAired(airDate: string | null, now = Date.now()) {
  return Boolean(airDate) && Date.parse(`${airDate}T00:00:00Z`) <= now;
}

export function airLabel(airDate: string | null) {
  return formatDate(
    airDate && `${airDate}T00:00:00Z`,
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
    "Date to be announced",
  );
}

export function runtimeLabel(minutes: number | null) {
  if (!minutes || minutes <= 0) {
    return "";
  }

  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`.replace(" 0m", "")
    : `${minutes}m`;
}

export function entriesByKey(entries: EpisodeEntry[]) {
  return new Map(
    entries.map((entry) => [entryKey(entry.scope, entry.season, entry.episode), entry]),
  );
}

export function episodeEntryFor(
  entries: Map<string, EpisodeEntry>,
  season: number,
  episode: number,
) {
  return entries.get(entryKey("episode", season, episode)) ?? null;
}

export function seasonEntryFor(entries: Map<string, EpisodeEntry>, season: number) {
  return entries.get(entryKey("season", season, SEASON_ENTRY_EPISODE)) ?? null;
}

export function seasonProgress(
  season: SeasonSummary,
  episodes: Episode[],
  entries: Map<string, EpisodeEntry>,
): SeasonProgress {
  const aired = episodes.filter((episode) => hasAired(episode.airDate));
  const marked = episodes.flatMap((episode) => {
    const entry = episodeEntryFor(entries, episode.seasonNumber, episode.episodeNumber);

    return entry ? [entry] : [];
  });
  const ratings = marked.flatMap((entry) => (entry.rating ? [entry.rating] : []));

  return {
    season: season.seasonNumber,
    episodes: episodes.length || season.episodeCount,
    aired: aired.length,
    watched: marked.filter((entry) => entry.watched).length,
    rated: ratings.length,
    noted: marked.filter((entry) => entry.notes.trim().length > 0).length,
    averageRating: ratings.length
      ? Math.round((ratings.reduce((total, score) => total + score, 0) / ratings.length) * 10) / 10
      : null,
  };
}

export function progressLabel(progress: ShowProgress | null) {
  if (!progress || progress.aired === 0) {
    return "";
  }

  const place = progress.furthest
    ? `${episodeLabel(progress.furthest.season, progress.furthest.episode)} · `
    : "";

  return `${place}${progress.watched} of ${progress.aired} episodes so far`;
}

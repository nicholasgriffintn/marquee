import { useCallback, useEffect, useMemo, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import {
  entriesByKey,
  entryKey,
  SEASON_ENTRY_EPISODE,
  type EntryScope,
  type EpisodeEntry,
  type SeasonDetail,
  type SeasonSummary,
  type ShowProgress,
} from "../domain/seasons";
import { jsonMutation, mutateJson, queryJson } from "../lib/query-client";

type SeasonIndexResponse = { seasons: SeasonSummary[]; source: string; fetchedAt: string };

type EpisodesResponse = { entries: EpisodeEntry[]; progress: ShowProgress };

type SaveResponse = { entry: EpisodeEntry | null; progress: ShowProgress };

const NO_SEASONS: SeasonSummary[] = [];
const NO_ENTRIES: EpisodeEntry[] = [];

function defaultSeason(seasons: SeasonSummary[], progress: ShowProgress | null) {
  if (progress?.upNext) {
    return progress.upNext.season;
  }

  if (progress?.furthest) {
    return progress.furthest.season;
  }

  const running = seasons.filter((season) => season.seasonNumber > 0);
  const latest = running.reduce<SeasonSummary | null>(
    (latestSoFar, season) =>
      !latestSoFar || season.seasonNumber > latestSoFar.seasonNumber ? season : latestSoFar,
    null,
  );

  return latest?.seasonNumber ?? seasons[0]?.seasonNumber ?? null;
}

export function useSeasons(item: MediaTitle, enabled: boolean, progress: ShowProgress | null) {
  const [index, setIndex] = useState<{ titleId: string; seasons: SeasonSummary[] } | null>(null);
  const [details, setDetails] = useState<Record<string, SeasonDetail>>({});
  const [chosen, setChosen] = useState<{ titleId: string; season: number } | null>(null);
  const [isLoadingIndex, setIsLoadingIndex] = useState(false);
  const [isLoadingSeason, setIsLoadingSeason] = useState(false);
  const [error, setError] = useState("");
  const active = enabled && item.mediaType === "tv";
  const { tmdbId, id } = item;
  const seasons = index?.titleId === id ? index.seasons : NO_SEASONS;
  const selected = chosen?.titleId === id ? chosen.season : defaultSeason(seasons, progress);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const controller = new AbortController();

    async function load() {
      setIsLoadingIndex(true);

      try {
        const response = await queryJson<SeasonIndexResponse>(`/api/catalog/tv/${tmdbId}/seasons`);

        setIndex({ titleId: `tv:${tmdbId}`, seasons: response.seasons });
        setError("");
      } catch {
        if (!controller.signal.aborted) {
          setError("The series listing is not answering.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingIndex(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [active, tmdbId]);

  const detailKey = selected === null ? "" : `${id}:${selected}`;
  const isDetailLoaded = Boolean(details[detailKey]);

  useEffect(() => {
    if (!active || selected === null || isDetailLoaded) {
      return undefined;
    }

    const controller = new AbortController();

    async function load() {
      setIsLoadingSeason(true);

      try {
        const response = await queryJson<SeasonDetail>(
          `/api/catalog/tv/${tmdbId}/seasons/${selected}`,
        );

        setDetails((current) => ({ ...current, [`tv:${tmdbId}:${selected}`]: response }));
      } catch {
        if (!controller.signal.aborted) {
          setError("That season would not come off the shelf.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSeason(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [active, isDetailLoaded, selected, tmdbId]);

  const season = detailKey ? (details[detailKey] ?? null) : null;
  const selectSeason = useCallback(
    (next: number | null) => setChosen(next === null ? null : { titleId: id, season: next }),
    [id],
  );

  return {
    seasons,
    season,
    selected,
    selectSeason,
    isLoading: isLoadingIndex && seasons.length === 0,
    isLoadingSeason: isLoadingSeason && !season,
    error,
  };
}

export type EpisodePatch = {
  scope?: EntryScope;
  season: number;
  episode?: number;
  watched?: boolean;
  rating?: number | null;
  notes?: string;
};

export function useEpisodeEntries(titleId: string, enabled: boolean) {
  const [tracked, setTracked] = useState<{
    titleId: string;
    entries: EpisodeEntry[];
    progress: ShowProgress | null;
  } | null>(null);
  const [message, setMessage] = useState("");
  const active = enabled && titleId.startsWith("tv:");
  const live = tracked?.titleId === titleId ? tracked : null;
  const entries = live?.entries ?? NO_ENTRIES;
  const progress = live?.progress ?? null;

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await queryJson<EpisodesResponse>(
          `/api/episodes?titleId=${encodeURIComponent(titleId)}`,
        );

        setTracked({ titleId, entries: response.entries, progress: response.progress });
        setMessage("");
      } catch {
        if (!controller.signal.aborted) {
          setMessage("I could not read your episode notes.");
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [active, titleId]);

  const byKey = useMemo(() => entriesByKey(entries), [entries]);

  const save = useCallback(
    async (patch: EpisodePatch) => {
      const scope = patch.scope ?? "episode";
      const episode = scope === "season" ? SEASON_ENTRY_EPISODE : (patch.episode ?? 0);
      const key = entryKey(scope, patch.season, episode);
      const existing = byKey.get(key);
      const next: EpisodeEntry = {
        titleId,
        scope,
        season: patch.season,
        episode,
        watched: patch.watched ?? existing?.watched ?? false,
        watchedAt: existing?.watchedAt ?? null,
        rating: patch.rating === undefined ? (existing?.rating ?? null) : patch.rating,
        notes: patch.notes ?? existing?.notes ?? "",
        updatedAt: new Date().toISOString(),
      };
      const previous = entries;
      const without = entries.filter(
        (entry) => entryKey(entry.scope, entry.season, entry.episode) !== key,
      );

      setTracked({ titleId, entries: [...without, next], progress });

      try {
        const response = await mutateJson<SaveResponse>(
          "/api/episodes",
          jsonMutation("POST", {
            titleId,
            scope,
            season: next.season,
            episode: next.episode,
            watched: next.watched,
            rating: next.rating,
            notes: next.notes,
          }),
        );

        setTracked({
          titleId,
          entries: response.entry ? [...without, response.entry] : without,
          progress: response.progress,
        });
        setMessage("");

        return true;
      } catch {
        setTracked({ titleId, entries: previous, progress });
        setMessage("That note did not stick. Try again.");

        return false;
      }
    },
    [byKey, entries, progress, titleId],
  );

  const mark = useCallback(
    async (season: number, watched: boolean, through: number | null = null) => {
      setMessage(watched ? "Marking those off…" : "Putting those back…");

      try {
        const response = await mutateJson<EpisodesResponse & { marked: number }>(
          "/api/episodes/mark",
          jsonMutation("POST", { titleId, season, watched, through }),
        );

        setTracked({ titleId, entries: response.entries, progress: response.progress });
        setMessage("");

        return true;
      } catch {
        setMessage("I could not mark those off. Try again.");

        return false;
      }
    },
    [titleId],
  );

  return { entries: byKey, progress, message, save, mark, isTracking: active };
}

export type EpisodeTracker = ReturnType<typeof useEpisodeEntries>;

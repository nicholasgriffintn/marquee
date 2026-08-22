import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

export type ScheduledEpisode = {
  titleId: string | null;
  showName: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  airsAt: string;
  network: string | null;
  item: MediaTitle | null;
};

type TonightResponse = { episodes: ScheduledEpisode[]; fetchedAt: string };

export function useTonight(isReady: boolean, limit: number) {
  const [episodes, setEpisodes] = useState<ScheduledEpisode[]>([]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const controller = new AbortController();

    requestJson<TonightResponse>(`/api/catalog/tonight?limit=${limit}`, {
      signal: controller.signal,
    })
      .then((response) => setEpisodes(response.episodes))
      .catch(() => setEpisodes([]));

    return () => controller.abort();
  }, [isReady, limit]);

  return episodes;
}

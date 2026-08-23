import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

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

const NO_EPISODES: ScheduledEpisode[] = [];

export function useTonight(isReady: boolean, limit: number) {
  const { data } = useResource<TonightResponse>(`/api/catalog/tonight?limit=${limit}`, {
    enabled: isReady,
  });

  return data?.episodes ?? NO_EPISODES;
}

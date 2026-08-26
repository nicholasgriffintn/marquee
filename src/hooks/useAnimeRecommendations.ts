import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

const NOTHING: MediaTitle[] = [];

export function useAnimeRecommendations(item: MediaTitle) {
  const hasRecommendations = Boolean(item.anime?.recommendations?.length);
  const { data } = useResource<{ items: MediaTitle[] }>(
    hasRecommendations
      ? `/api/catalog/titles/${encodeURIComponent(item.id)}/anime-recommendations`
      : null,
  );

  return data?.items ?? NOTHING;
}

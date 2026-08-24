import { watchOrderPlacement } from "../domain/anime";
import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

export type WatchOrderEntry = { relation: string; item: MediaTitle };

const NOTHING: WatchOrderEntry[] = [];

export function useWatchOrder(item: MediaTitle) {
  const hasRelations = Boolean(item.anime?.relations?.length);
  const { data } = useResource<{ related: WatchOrderEntry[] }>(
    hasRelations ? `/api/catalog/titles/${encodeURIComponent(item.id)}/watch-order` : null,
  );
  const entries = data?.related ?? NOTHING;

  return {
    before: entries.filter((entry) => watchOrderPlacement(entry.relation) === "before"),
    after: entries.filter((entry) => watchOrderPlacement(entry.relation) === "after"),
    related: entries.filter((entry) => watchOrderPlacement(entry.relation) === "related"),
  };
}

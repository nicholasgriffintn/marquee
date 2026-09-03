import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

export function useTitle(titleId: string | undefined, known: Map<string, MediaTitle>) {
  const resolved = titleId ? (known.get(titleId) ?? null) : null;
  const { data, error, isLoading, isRefreshing, reload } = useResource<{
    items: MediaTitle[];
    gated?: string[];
  }>(titleId ? `/api/catalog/items?ids=${encodeURIComponent(titleId)}` : null, {
    errorMessage: "Title details are unavailable right now.",
  });
  const fetched = data?.items[0] ?? null;
  const isBusy = isLoading || isRefreshing;

  if (!titleId) {
    return { title: null, error: "", isLoading: false, isMissing: false, isGated: false, reload };
  }

  const title = fetched?.id === titleId ? fetched : resolved;
  const isGated = !title && Boolean(data?.gated?.includes(titleId));

  return {
    title,
    error: title || isBusy ? "" : error,
    isLoading: !title && isBusy,
    isMissing: !title && !isBusy && !error && !isGated,
    isGated,
    reload,
  };
}

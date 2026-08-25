import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

export function useTitle(titleId: string | undefined, known: Map<string, MediaTitle>) {
  const resolved = titleId ? (known.get(titleId) ?? null) : null;
  const { data, error, isLoading, reload } = useResource<{ items: MediaTitle[] }>(
    titleId && !resolved ? `/api/catalog/items?ids=${encodeURIComponent(titleId)}` : null,
    { errorMessage: "Title details are unavailable right now." },
  );
  const fetched = data?.items[0] ?? null;

  if (!titleId) {
    return { title: null, error: "", isLoading: false, isMissing: false, reload };
  }

  const title = resolved ?? (fetched?.id === titleId ? fetched : null);

  return {
    title,
    error: title || isLoading ? "" : error,
    isLoading: !title && isLoading,
    isMissing: !title && !isLoading && !error,
    reload,
  };
}

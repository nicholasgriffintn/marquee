import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

export function useTitle(titleId: string | undefined, known: Map<string, MediaTitle>) {
  const resolved = titleId ? (known.get(titleId) ?? null) : null;
  const { data, isLoading } = useResource<{ items: MediaTitle[] }>(
    titleId && !resolved ? `/api/catalog/items?ids=${encodeURIComponent(titleId)}` : null,
  );
  const fetched = data?.items[0] ?? null;

  if (!titleId) {
    return { title: null, isLoading: false, isMissing: false };
  }

  const title = resolved ?? (fetched?.id === titleId ? fetched : null);

  return { title, isLoading: !title && isLoading, isMissing: !title && !isLoading };
}

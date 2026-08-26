import type { FeaturedTitleResponse } from "../domain/catalog";
import { useResource } from "./useResource";

export function useFeaturedTitle(providerIds: string[], enabled: boolean, refreshKey: string) {
  const providerKey = providerIds.join(",");
  const path = `/api/catalog/featured${
    providerKey ? `?providers=${encodeURIComponent(providerKey)}` : ""
  }`;
  const { data, error, isLoading } = useResource<FeaturedTitleResponse>(path, {
    enabled,
    refreshKey,
    errorMessage: "The featured title is unavailable",
  });

  return {
    item: data?.item ?? null,
    error,
    isResolved: !enabled || !isLoading,
  };
}

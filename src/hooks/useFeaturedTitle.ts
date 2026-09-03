import { useCallback, useState } from "react";

import type { FeaturedTitleResponse } from "../domain/catalog";
import { recordRefusal } from "../lib/refusals";
import { useResource } from "./useResource";

export function useFeaturedTitle(providerIds: string[], enabled: boolean, refreshKey: string) {
  const [refusedAt, setRefusedAt] = useState("");
  const providerKey = providerIds.join(",");
  const query = [
    providerKey ? `providers=${encodeURIComponent(providerKey)}` : "",
    refusedAt ? `refresh=${refusedAt}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const path = `/api/catalog/featured${query ? `?${query}` : ""}`;
  const { data, error, isLoading } = useResource<FeaturedTitleResponse>(path, {
    enabled,
    refreshKey,
    errorMessage: "The featured title is unavailable",
  });

  const refuse = useCallback(async (titleId: string) => {
    await recordRefusal(titleId, "featured", { scope: "never" });
    setRefusedAt(Date.now().toString(36));
  }, []);

  return {
    item: data?.item ?? null,
    error,
    isResolved: !enabled || !isLoading,
    refuse,
  };
}

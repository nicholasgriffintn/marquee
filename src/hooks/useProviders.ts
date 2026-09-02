import type { Provider, ProvidersResponse } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_PROVIDERS: Provider[] = [];
const NO_SOURCES: string[] = [];

const EMPTY_STATS: ProvidersResponse["stats"] = {
  configured: 0,
  live: 0,
  stale: 0,
  unresolved: 0,
  outOfScope: 0,
  failed: 0,
  longTail: 0,
  titlesCovered: 0,
};

const PROVIDERS_STALE_MS = 5 * 60_000;

export function useProviders() {
  const { data, error } = useResource<ProvidersResponse>("/api/catalog/providers", {
    errorMessage: "Live catalogue is unavailable",
    staleTime: PROVIDERS_STALE_MS,
  });

  return {
    providers: data?.providers ?? NO_PROVIDERS,
    sources: data?.sources ?? NO_SOURCES,
    stats: data?.stats ?? EMPTY_STATS,
    error,
  };
}

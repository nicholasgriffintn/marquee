import type { Provider, ProvidersResponse } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_PROVIDERS: Provider[] = [];
const NO_SOURCES: string[] = [];

const EMPTY_STATS: ProvidersResponse["stats"] = {
  configured: 0,
  feeds: 0,
  links: 0,
  markers: 0,
  longTail: 0,
};

export function useProviders() {
  const { data, error } = useResource<ProvidersResponse>("/api/catalog/providers", {
    errorMessage: "Live catalogue is unavailable",
  });

  return {
    providers: data?.providers ?? NO_PROVIDERS,
    sources: data?.sources ?? NO_SOURCES,
    stats: data?.stats ?? EMPTY_STATS,
    error,
  };
}

import type { TrailerCard, TrailersResponse, TrailerSort } from "../domain/trailers";
import { useResource } from "./useResource";

const NO_TRAILERS: TrailerCard[] = [];

export function useTrailers(sort: TrailerSort, isReady: boolean) {
  const { data, error, isLoading } = useResource<TrailersResponse>(
    `/api/catalog/trailers?sort=${sort}`,
    { enabled: isReady, errorMessage: "The trailers are unavailable" },
  );

  return { trailers: data?.trailers ?? NO_TRAILERS, error, isLoading: isLoading || !isReady };
}

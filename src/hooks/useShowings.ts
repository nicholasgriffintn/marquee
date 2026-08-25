import type { MediaTitle } from "../domain/catalog";
import type { TitleShowings } from "../domain/cinema";
import { useResource } from "./useResource";

const NO_LISTINGS: TitleShowings["listings"] = [];

export function useShowings(item: MediaTitle, enabled: boolean) {
  const isAvailable = enabled && item.mediaType === "movie";
  const { data, isLoading, error } = useResource<TitleShowings>(
    `/api/cinema/titles/${item.mediaType}/${item.tmdbId}`,
    { enabled: isAvailable },
  );
  const listings = data?.listings ?? NO_LISTINGS;

  return {
    listings,
    origin: data?.origin ?? null,
    isLoading: isLoading && listings.length === 0,
    error,
    isAvailable,
  };
}

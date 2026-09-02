import { useResource } from "./useResource";

export type BuildingCounts = {
  titles: number;
  movies: number;
  shows: number;
  people: number;
  seasons: number;
  embeddings: number;
  prints: number;
  printsMirrored: number;
  cinemas: number;
  screenings: number;
  upcoming: number;
};

export function useBuilding(enabled: boolean) {
  const { data, error, isLoading } = useResource<{
    counts: BuildingCounts;
    fetchedAt: string;
  }>("/api/catalog/building", { enabled, errorMessage: "The booth is not answering" });

  return { counts: data?.counts ?? null, fetchedAt: data?.fetchedAt ?? "", error, isLoading };
}

import type { CatalogSection } from "../domain/catalog";
import { useResource } from "./useResource";

const NO_SECTIONS: CatalogSection[] = [];

export function usePersonalRails(isSignedIn: boolean, savedKey: string) {
  const { data, isLoading } = useResource<{ sections: CatalogSection[] }>("/api/catalog/rails", {
    enabled: isSignedIn,
    refreshKey: savedKey,
  });

  return {
    sections: data?.sections ?? NO_SECTIONS,
    isResolved: !isSignedIn || !isLoading,
  };
}

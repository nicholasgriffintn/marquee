import { usePagedList } from "./usePagedList";

export type DirectoryPerson = {
  personId: number;
  name: string;
  titles: number;
};

export type DirectoryCollection = { id: number; name: string; titles: number };

function directoryPath(resource: string, query: string) {
  const term = query.trim();

  return term
    ? `/api/catalog/${resource}?query=${encodeURIComponent(term)}`
    : `/api/catalog/${resource}`;
}

export function usePeopleDirectory(query: string, enabled: boolean) {
  return usePagedList<DirectoryPerson>(
    enabled ? directoryPath("people", query) : null,
    "Could not load the names.",
  );
}

export function useCollectionsDirectory(query: string, enabled: boolean) {
  return usePagedList<DirectoryCollection>(
    enabled ? directoryPath("collections", query) : null,
    "Could not load the collections.",
  );
}

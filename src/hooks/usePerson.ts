import { useCallback, useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { isAbortError, jsonRequest, requestJson } from "../lib/api";
import { useResource } from "./useResource";

export type PersonResponse = {
  person: { name: string; titles: number };
  items: MediaTitle[];
  shelf: { shelved: number; watched: number };
  page: number;
  hasMore: boolean;
};

const NO_ITEMS: MediaTitle[] = [];

export function usePerson(name: string, isSignedIn: boolean) {
  const [person, setPerson] = useState<PersonResponse["person"] | null>(null);
  const [shelf, setShelf] = useState({ shelved: 0, watched: 0 });
  const [items, setItems] = useState<MediaTitle[]>(NO_ITEMS);
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const key = name.toLowerCase();
  const page = pageState.key === key ? pageState.page : 0;
  const active = Boolean(name);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const controller = new AbortController();
    let alive = true;

    async function load() {
      setIsLoading(true);

      try {
        const response = await requestJson<PersonResponse>(
          `/api/catalog/people/${encodeURIComponent(name)}?page=${page}`,
          { signal: controller.signal },
        );

        if (!alive) {
          return;
        }

        setPerson(response.person);
        setShelf(response.shelf);
        setItems((current) => (page === 0 ? response.items : [...current, ...response.items]));
        setHasMore(response.hasMore);
        setLoadError("");
      } catch (caught) {
        if (alive && !isAbortError(caught)) {
          if (page === 0) {
            setLoadError("I have nobody by that name in the book.");
            setPerson(null);
            setItems(NO_ITEMS);
          } else {
            setLoadError("That did not load.");
          }
        }
      } finally {
        if (alive) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [active, name, page]);

  const followedResource = useResource<{ following: string[] }>("/api/notebook/people", {
    enabled: isSignedIn,
  });
  const [followed, setFollowed] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState("");
  const following =
    isSignedIn && (followed ?? followedResource.data?.following ?? []).includes(name.toLowerCase());

  const toggleFollow = useCallback(async () => {
    const follow = !following;

    try {
      const response = await requestJson<{ following: string[] }>(
        "/api/notebook/people",
        jsonRequest("POST", { name, follow }),
      );

      setFollowed(response.following);
    } catch {
      setSaveError("That did not take.");
    }
  }, [following, name]);

  return {
    data: person ? { person, items, shelf } : null,
    following,
    error: saveError || loadError,
    isLoading: active && isLoading,
    hasMore: active && hasMore,
    loadMore: () => setPageState({ key, page: page + 1 }),
    toggleFollow,
  };
}

import { useCallback, useEffect, useState } from "react";

import { NO_AWARDS, type AwardSummary } from "../domain/awards";
import type { MediaTitle } from "../domain/catalog";
import { jsonMutation, mutateJson, queryJson, QueryError } from "../lib/query-client";
import { useResource } from "./useResource";

export type PersonResponse = {
  person: { name: string; titles: number };
  items: MediaTitle[];
  shelf: { shelved: number; watched: number };
  awards: AwardSummary;
  page: number;
  hasMore: boolean;
};

const NO_ITEMS: MediaTitle[] = [];

export function usePerson(identifier: string, isSignedIn: boolean) {
  const [person, setPerson] = useState<PersonResponse["person"] | null>(null);
  const [shelf, setShelf] = useState({ shelved: 0, watched: 0 });
  const [awards, setAwards] = useState<AwardSummary>(NO_AWARDS);
  const [items, setItems] = useState<MediaTitle[]>(NO_ITEMS);
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const key = identifier.toLowerCase();
  const page = pageState.key === key ? pageState.page : 0;
  const active = Boolean(identifier);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let alive = true;

    async function load() {
      setIsLoading(true);

      try {
        const response = await queryJson<PersonResponse>(
          `/api/catalog/people/${encodeURIComponent(identifier)}?page=${page}`,
        );

        if (!alive) {
          return;
        }

        setPerson(response.person);
        setShelf(response.shelf);
        setAwards(response.awards);
        setItems((current) => (page === 0 ? response.items : [...current, ...response.items]));
        setHasMore(response.hasMore);
        setLoadError("");
      } catch (caught) {
        if (alive) {
          if (page === 0) {
            const notFound = caught instanceof QueryError && caught.status === 404;

            setLoadError(
              notFound
                ? "I have nobody by that name in the book."
                : "Could not load this page. Try again.",
            );
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
    };
  }, [active, identifier, page]);

  const followedResource = useResource<{ following: string[] }>("/api/notebook/people", {
    enabled: isSignedIn,
  });
  const [followed, setFollowed] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState("");
  const following =
    isSignedIn &&
    Boolean(person) &&
    (followed ?? followedResource.data?.following ?? []).includes(person?.name.toLowerCase() ?? "");

  const toggleFollow = useCallback(async () => {
    if (!person) {
      return;
    }

    const follow = !following;

    try {
      const response = await mutateJson<{ following: string[] }>(
        "/api/notebook/people",
        jsonMutation("POST", { name: person.name, follow }),
      );

      setFollowed(response.following);
    } catch {
      setSaveError("That did not take.");
    }
  }, [following, person]);

  return {
    data: person ? { person, items, shelf, awards } : null,
    following,
    error: loadError,
    saveError,
    isLoading: active && isLoading,
    hasMore: active && hasMore,
    loadMore: () => setPageState({ key, page: page + 1 }),
    toggleFollow,
  };
}

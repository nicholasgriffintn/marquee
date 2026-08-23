import { useCallback, useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { jsonRequest, requestJson } from "../lib/api";

export type PersonResponse = {
  person: { name: string; titles: number };
  items: MediaTitle[];
  shelf: { shelved: number; watched: number };
};

export function usePerson(name: string, isSignedIn: boolean) {
  const [data, setData] = useState<PersonResponse | null>(null);
  const [followed, setFollowed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);

      try {
        const response = await requestJson<PersonResponse>(
          `/api/catalog/people/${encodeURIComponent(name)}`,
          { signal: controller.signal },
        );

        setData(response);
        setError("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setData(null);
        setError("I have nobody by that name in the book.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [name]);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    void requestJson<{ following: string[] }>("/api/notebook/people", {
      signal: controller.signal,
    })
      .then((response) => setFollowed(response.following))
      .catch(() => undefined);

    return () => controller.abort();
  }, [name, isSignedIn]);

  const following = isSignedIn && followed.includes(name.toLowerCase());

  const toggleFollow = useCallback(async () => {
    const follow = !following;

    try {
      const response = await requestJson<{ following: string[] }>(
        "/api/notebook/people",
        jsonRequest("POST", { name, follow }),
      );

      setFollowed(response.following);
    } catch {
      setError("That did not take.");
    }
  }, [following, name]);

  return { data, following, error, isLoading, toggleFollow };
}

export function useCollection(collectionId: number | null | undefined) {
  const [fetched, setFetched] = useState<{ id: number; items: MediaTitle[] } | null>(null);

  useEffect(() => {
    if (!collectionId) {
      return;
    }

    const controller = new AbortController();

    void requestJson<{ items: MediaTitle[] }>(`/api/catalog/collections/${collectionId}`, {
      signal: controller.signal,
    })
      .then((response) => setFetched({ id: collectionId, items: response.items }))
      .catch(() => undefined);

    return () => controller.abort();
  }, [collectionId]);

  return collectionId && fetched?.id === collectionId ? fetched.items : [];
}

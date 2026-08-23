import { useCallback, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { jsonRequest, requestJson } from "../lib/api";
import { useResource } from "./useResource";

export type PersonResponse = {
  person: { name: string; titles: number };
  items: MediaTitle[];
  shelf: { shelved: number; watched: number };
};

export function usePerson(name: string, isSignedIn: boolean) {
  const person = useResource<PersonResponse>(`/api/catalog/people/${encodeURIComponent(name)}`, {
    errorMessage: "I have nobody by that name in the book.",
  });
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
    data: person.data,
    following,
    error: saveError || person.error,
    isLoading: person.isLoading,
    toggleFollow,
  };
}

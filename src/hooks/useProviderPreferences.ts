import { useCallback, useEffect, useState } from "react";

import { jsonMutation, mutateJson } from "../lib/query-client";
import { useResource } from "./useResource";

const STORAGE_KEY = "marquee.selectedProviderIds";

function readStored(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");

    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string" && Boolean(id)).slice(0, 40)
      : [];
  } catch {
    return [];
  }
}

function writeStored(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    return;
  }
}

type ProviderPreferences = { selectedProviderIds: string[]; isSaved: boolean };

export function useProviderPreferences(isSignedIn: boolean) {
  const [guestIds, setGuestIds] = useState<string[]>(readStored);
  const [override, setOverride] = useState<string[] | null>(null);
  const { data, isLoading, reload } = useResource<ProviderPreferences>("/api/profile/providers", {
    enabled: isSignedIn,
  });
  const shouldMigrate = isSignedIn && data !== null && !data.isSaved && guestIds.length > 0;

  useEffect(() => {
    if (!shouldMigrate) {
      return;
    }

    void mutateJson(
      "/api/profile/providers",
      jsonMutation("POST", { selectedProviderIds: guestIds }),
    )
      .then(reload)
      .catch(() => undefined);
  }, [shouldMigrate, guestIds, reload]);

  const selectProviders = useCallback(
    (nextIds: string[]) => {
      if (!isSignedIn) {
        setGuestIds(nextIds);
        writeStored(nextIds);

        return;
      }

      setOverride(nextIds);
      mutateJson(
        "/api/profile/providers",
        jsonMutation("POST", { selectedProviderIds: nextIds }),
      ).catch(() => setOverride(null));
    },
    [isSignedIn],
  );

  const signedInIds = shouldMigrate ? guestIds : (override ?? data?.selectedProviderIds ?? []);

  return {
    selectedProviderIds: isSignedIn ? signedInIds : guestIds,
    isResolved: !isSignedIn || !isLoading,
    selectProviders,
  };
}

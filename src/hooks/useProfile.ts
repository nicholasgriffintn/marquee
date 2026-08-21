import { useEffect, useMemo, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";
import type { EntryStatus, ViewingEntry } from "../types";

type ProfileResponse = {
  entries: ViewingEntry[];
  selectedProviderIds: string[] | null;
};

const NO_IDS: string[] = [];
const NO_ENTRIES: Record<string, ViewingEntry> = {};

const emptyEntry = (titleId: string): ViewingEntry => ({
  titleId,
  status: "watchlist",
  rating: null,
  thoughts: "",
});

export function useProfile(isSignedIn: boolean) {
  const [entries, setEntries] = useState<Record<string, ViewingEntry>>({});
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const savedIds = useMemo(() => Object.keys(entries), [entries]);

  useEffect(() => {
    const controller = new AbortController();

    if (!isSignedIn) {
      return () => controller.abort();
    }

    async function loadProfile() {
      try {
        const profile = await requestJson<ProfileResponse>("/api/profile", {
          signal: controller.signal,
        });

        setEntries(Object.fromEntries(profile.entries.map((entry) => [entry.titleId, entry])));
        if (profile.selectedProviderIds !== null) {
          setSelectedProviderIds(profile.selectedProviderIds);
        }

        setMessage("");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage("Could not load your saved profile. New changes may not sync.");
        }
      }
    }

    void loadProfile();

    return () => controller.abort();
  }, [isSignedIn]);

  async function savePreferences(nextIds: string[]) {
    const previous = selectedProviderIds;

    setSelectedProviderIds(nextIds);
    setMessage("Saving services…");
    try {
      await requestJson("/api/profile", jsonRequest("POST", { selectedProviderIds: nextIds }));
      setMessage("Services saved");
    } catch {
      setSelectedProviderIds(previous);
      setMessage("Services could not be saved. Try again.");
    }
  }

  async function saveEntry(entry: ViewingEntry) {
    const previous = entries[entry.titleId];

    setEntries((current) => ({ ...current, [entry.titleId]: entry }));
    setMessage("Saving shelf…");
    try {
      const payload = await requestJson<{ entry: ViewingEntry }>(
        "/api/profile",
        jsonRequest("POST", entry),
      );

      setEntries((current) => ({ ...current, [entry.titleId]: payload.entry }));
      setMessage("Shelf saved");

      return true;
    } catch {
      setEntries((current) => {
        const next = { ...current };

        if (previous) {
          next[entry.titleId] = previous;
        } else {
          delete next[entry.titleId];
        }

        return next;
      });
      setMessage("Shelf could not be saved. Try again.");

      return false;
    }
  }

  async function removeEntry(titleId: string) {
    const previous = entries[titleId];

    setEntries((current) => {
      const next = { ...current };

      delete next[titleId];

      return next;
    });
    setMessage("Removing from shelf…");
    try {
      await requestJson(`/api/profile/${encodeURIComponent(titleId)}`, jsonRequest("DELETE"));
      setMessage("Removed from shelf");
    } catch {
      if (previous) {
        setEntries((current) => ({ ...current, [titleId]: previous }));
      }

      setMessage("Could not remove that title. Try again.");
    }
  }

  function updateDraft(
    titleId: string,
    patch: Partial<Pick<ViewingEntry, "thoughts" | "rating" | "status">>,
  ) {
    setEntries((current) => ({
      ...current,
      [titleId]: { ...(current[titleId] ?? emptyEntry(titleId)), ...patch },
    }));
  }

  function setStatus(titleId: string, status: EntryStatus) {
    const entry = { ...(entries[titleId] ?? emptyEntry(titleId)), status };

    void saveEntry(entry);
  }

  return {
    entries: isSignedIn ? entries : NO_ENTRIES,
    savedIds: isSignedIn ? savedIds : NO_IDS,
    selectedProviderIds: isSignedIn ? selectedProviderIds : NO_IDS,
    message: isSignedIn ? message : "",
    removeEntry,
    saveEntry,
    savePreferences,
    setStatus,
    updateDraft,
  };
}

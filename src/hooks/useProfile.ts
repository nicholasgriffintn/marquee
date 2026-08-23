import { useCallback, useEffect, useRef, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";
import type { EntryStatus, ViewingEntry } from "../types";

type ProfileSummary = {
  shelved: number;
  unrated: number;
  updatedAt: string;
};

const EMPTY_SUMMARY: ProfileSummary = { shelved: 0, unrated: 0, updatedAt: "" };

const SUCCESS_HOLD_MS = 3_500;
const ERROR_HOLD_MS = 8_000;
const NO_ENTRIES: Record<string, ViewingEntry> = {};

const emptyEntry = (titleId: string): ViewingEntry => ({
  titleId,
  status: "watchlist",
  rating: null,
  thoughts: "",
});

export function useProfile(isSignedIn: boolean) {
  const [summary, setSummary] = useState<ProfileSummary>(EMPTY_SUMMARY);
  const [entries, setEntries] = useState<Record<string, ViewingEntry>>({});
  const [message, setMessage] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const messageTimer = useRef(0);
  const announce = useCallback((text: string, holdMs = SUCCESS_HOLD_MS) => {
    window.clearTimeout(messageTimer.current);
    setMessage(text);

    if (text && holdMs > 0) {
      messageTimer.current = window.setTimeout(() => setMessage(""), holdMs);
    }
  }, []);

  useEffect(() => () => window.clearTimeout(messageTimer.current), []);

  useEffect(() => {
    const controller = new AbortController();

    if (!isSignedIn) {
      return () => controller.abort();
    }

    async function loadProfile() {
      try {
        const profile = await requestJson<ProfileSummary>("/api/profile", {
          signal: controller.signal,
        });

        setSummary(profile);
        announce("");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          announce("Could not load your saved profile. New changes may not sync.", ERROR_HOLD_MS);
        }
      } finally {
        setIsLoaded(true);
      }
    }

    void loadProfile();

    return () => controller.abort();
  }, [isSignedIn, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const loadEntry = useCallback(
    async (titleId: string) => {
      if (!isSignedIn) {
        return;
      }

      try {
        const response = await requestJson<{ entry: ViewingEntry | null }>(
          `/api/profile/entry/${encodeURIComponent(titleId)}`,
        );

        setEntries((current) => {
          const next = { ...current };

          if (response.entry) {
            next[titleId] = response.entry;
          } else {
            delete next[titleId];
          }

          return next;
        });
      } catch {
        return;
      }
    },
    [isSignedIn],
  );

  async function saveEntry(entry: ViewingEntry) {
    const previous = entries[entry.titleId];

    setEntries((current) => ({ ...current, [entry.titleId]: entry }));
    announce("Saving shelf…", 0);
    refresh();
    try {
      const payload = await requestJson<{ entry: ViewingEntry }>(
        "/api/profile",
        jsonRequest("POST", entry),
      );

      setEntries((current) => ({ ...current, [entry.titleId]: payload.entry }));
      announce("Shelf saved");

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
      announce("Shelf could not be saved. Try again.", ERROR_HOLD_MS);

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
    announce("Removing from shelf…", 0);
    refresh();
    try {
      await requestJson(`/api/profile/${encodeURIComponent(titleId)}`, jsonRequest("DELETE"));
      announce("Removed from shelf");
    } catch {
      if (previous) {
        setEntries((current) => ({ ...current, [titleId]: previous }));
      }

      announce("Could not remove that title. Try again.", ERROR_HOLD_MS);
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
    shelved: isSignedIn ? summary.shelved : 0,
    unrated: isSignedIn ? summary.unrated : 0,
    shelfKey: isSignedIn ? `${summary.shelved}:${summary.updatedAt}` : "",
    message: isSignedIn ? message : "",
    isLoaded: isSignedIn ? isLoaded : true,
    loadEntry,
    refresh,
    removeEntry,
    saveEntry,
    setStatus,
    updateDraft,
  };
}

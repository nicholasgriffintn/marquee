import { useCallback, useEffect, useRef, useState } from "react";

import {
  beginEntryLoad,
  createProfileEntryCoordinator,
  entryLoadFailed,
  entryLoadSucceeded,
  isRetryableProfileError,
  profileSaveSettlement,
  runProfileMutation,
  type ProfileEntryState,
} from "../domain/profile-entry";
import { ApiError, isAbortError, jsonRequest, requestJson } from "../lib/api";
import { requestProfileEntry } from "../lib/profile-entry-request";
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
const NO_ENTRY_STATES: Record<string, ProfileEntryState> = {};

const emptyEntry = (titleId: string): ViewingEntry => ({
  titleId,
  status: "watchlist",
  rating: null,
  thoughts: "",
});

export function useProfile(isSignedIn: boolean) {
  const [summary, setSummary] = useState<ProfileSummary>(EMPTY_SUMMARY);
  const [entries, setEntries] = useState<Record<string, ViewingEntry>>({});
  const [entryStates, setEntryStates] = useState<Record<string, ProfileEntryState>>({});
  const [message, setMessage] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [operations] = useState(createProfileEntryCoordinator);
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
        if (!isAbortError(error)) {
          announce("Could not load your saved profile. New changes may not sync.", ERROR_HOLD_MS);
        }
      } finally {
        setIsLoaded(true);
      }
    }

    void loadProfile();

    return () => controller.abort();
  }, [announce, isSignedIn, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const loadEntry = useCallback(
    async (titleId: string, signal?: AbortSignal) => {
      if (!isSignedIn) {
        return;
      }

      const generation = operations.begin(titleId);

      setEntryStates((current) => ({
        ...current,
        [titleId]: beginEntryLoad(),
      }));

      try {
        const response = await operations.enqueue(titleId, () =>
          requestProfileEntry(titleId, signal),
        );

        if (!operations.isCurrent(titleId, generation)) {
          return;
        }

        setEntries((current) => {
          const next = { ...current };

          if (response.entry) {
            next[titleId] = response.entry;
          } else {
            delete next[titleId];
          }

          return next;
        });
        setEntryStates((current) => ({
          ...current,
          [titleId]: entryLoadSucceeded(response.entry),
        }));
      } catch (error) {
        if (isAbortError(error) || !operations.isCurrent(titleId, generation)) {
          return;
        }

        const status = error instanceof ApiError ? error.status : undefined;

        setEntryStates((current) => ({
          ...current,
          [titleId]: entryLoadFailed(isRetryableProfileError(status)),
        }));
      }
    },
    [isSignedIn, operations],
  );

  async function saveEntry(entry: ViewingEntry) {
    const generation = operations.begin(entry.titleId);

    setEntries((current) => ({ ...current, [entry.titleId]: entry }));
    setEntryStates((current) => ({
      ...current,
      [entry.titleId]: entryLoadSucceeded(entry),
    }));
    announce("Saving shelf…", 0);
    try {
      const payload = await runProfileMutation(
        () =>
          operations.enqueue(entry.titleId, () =>
            requestJson<{ entry: ViewingEntry }>("/api/profile", jsonRequest("POST", entry)),
          ),
        refresh,
      );

      const settlement = profileSaveSettlement(
        "success",
        operations.isCurrent(entry.titleId, generation),
      );

      announce(settlement.message);

      if (!settlement.applyServerEntry) {
        return true;
      }

      setEntries((current) => ({ ...current, [entry.titleId]: payload.entry }));
      setEntryStates((current) => ({
        ...current,
        [entry.titleId]: entryLoadSucceeded(payload.entry),
      }));

      return true;
    } catch {
      const settlement = profileSaveSettlement(
        "failure",
        operations.isCurrent(entry.titleId, generation),
      );

      announce(settlement.message, ERROR_HOLD_MS);

      if (!settlement.reconcile) {
        return false;
      }

      await loadEntry(entry.titleId);

      return false;
    }
  }

  async function removeEntry(titleId: string) {
    const generation = operations.begin(titleId);

    setEntries((current) => {
      const next = { ...current };

      delete next[titleId];

      return next;
    });
    setEntryStates((current) => ({
      ...current,
      [titleId]: entryLoadSucceeded(null),
    }));
    announce("Removing from shelf…", 0);
    try {
      await runProfileMutation(
        () =>
          operations.enqueue(titleId, () =>
            requestJson(`/api/profile/${encodeURIComponent(titleId)}`, jsonRequest("DELETE")),
          ),
        refresh,
      );

      if (!operations.isCurrent(titleId, generation)) {
        return true;
      }

      announce("Removed from shelf");

      return true;
    } catch {
      if (!operations.isCurrent(titleId, generation)) {
        return false;
      }

      announce("Could not remove that title. Try again.", ERROR_HOLD_MS);
      await loadEntry(titleId);

      return false;
    }
  }

  function updateDraft(
    titleId: string,
    patch: Partial<Pick<ViewingEntry, "thoughts" | "rating" | "status">>,
  ) {
    const entry = { ...(entries[titleId] ?? emptyEntry(titleId)), ...patch };

    operations.begin(titleId);
    setEntries((current) => ({ ...current, [titleId]: entry }));
    setEntryStates((current) => ({
      ...current,
      [titleId]: entryLoadSucceeded(entry),
    }));
  }

  function setStatus(titleId: string, status: EntryStatus) {
    const entry = { ...(entries[titleId] ?? emptyEntry(titleId)), status };

    void saveEntry(entry);
  }

  return {
    entries: isSignedIn ? entries : NO_ENTRIES,
    entryStates: isSignedIn ? entryStates : NO_ENTRY_STATES,
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

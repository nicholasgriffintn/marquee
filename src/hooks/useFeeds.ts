import { useCallback, useEffect, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";

export type FeedKeys = {
  subscribed: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
  calendarUrl: string | null;
  alertsUrl: string | null;
};

const EMPTY: FeedKeys = {
  subscribed: false,
  createdAt: null,
  lastUsedAt: null,
  calendarUrl: null,
  alertsUrl: null,
};

export function useFeeds(isSignedIn: boolean) {
  const [keys, setKeys] = useState<FeedKeys>(EMPTY);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!isSignedIn) {
      return;
    }

    try {
      setKeys(await requestJson<FeedKeys>("/api/notebook/feeds"));
    } catch {
      setError("Could not read your subscriptions.");
    }
  }, [isSignedIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);

    return () => window.clearTimeout(timer);
  }, [reload]);

  const cutKey = useCallback(async () => {
    setError("");

    try {
      setKeys(await requestJson<FeedKeys>("/api/notebook/feeds", jsonRequest("POST")));
    } catch {
      setError("Could not cut you a key.");
    }
  }, []);

  const dropKey = useCallback(async () => {
    setError("");

    try {
      setKeys(await requestJson<FeedKeys>("/api/notebook/feeds", jsonRequest("DELETE")));
    } catch {
      setError("Could not take that key back.");
    }
  }, []);

  return { keys, error, cutKey, dropKey };
}

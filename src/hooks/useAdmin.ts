import { useCallback, useEffect, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";
import type { UserRole } from "../types";

export type AdminAction =
  | "sweep-light"
  | "sweep-deep"
  | "digest"
  | "availability"
  | "enrichment"
  | "embeddings"
  | "discover"
  | "schedule"
  | "buzz"
  | "providers"
  | "sections"
  | "working-set"
  | "alerts-preview"
  | "alerts-send"
  | "angle-scores"
  | "people"
  | "cinemas"
  | "showtimes"
  | "revival-sweep"
  | "revival-match"
  | "revival-rights"
  | "revival-recheck"
  | "revival-mirror"
  | "anime-ids";

export type AdminOverview = {
  catalogue: Record<string, number>;
  enrichment: { source: string; titles: number; misses: number; newest: string }[];
  backfill: {
    mediaType: string;
    status: string;
    partitions: number;
    titles: number;
    pagesDone: number;
    totalPages: number;
  }[];
  failures: {
    jobType: string;
    subjectId: string | null;
    error: string | null;
    startedAt: string;
  }[];
  lastRuns: {
    jobType: string;
    status: string;
    lastRunAt: string;
    runs: number;
    subjects: number;
  }[];
  runWindowHours: number;
  budgets: {
    source: string;
    callLimit: number;
    used: number;
    windowKind: string;
    pausedUntil: string | null;
  }[];
  cinemas: {
    source: string;
    cinemas: number;
    located: number;
    screenings: number;
    matched: number;
    films: number;
  }[];
  sections: { id: string; title: string; titles: number; builtAt: string }[];
  fetchedAt: string;
};

export type AdminUser = {
  id: string;
  name: string;
  login: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
  shelfEntries: number;
};

export function useAdmin(enabled: boolean) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const [nextOverview, nextUsers] = await Promise.all([
        requestJson<AdminOverview>("/api/admin/overview"),
        requestJson<{ users: AdminUser[] }>("/api/admin/users"),
      ]);

      setOverview(nextOverview);
      setUsers(nextUsers.users);
      setError("");
    } catch {
      setError("Could not read the admin panel.");
    }
  }, [enabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const run = useCallback(
    async (action: AdminAction) => {
      setPending(action);
      setMessage("");

      try {
        const result = await requestJson<{ detail: string }>(
          `/api/admin/actions/${action}`,
          jsonRequest("POST"),
        );

        setMessage(result.detail);
        setError("");
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That action failed.");
      } finally {
        setPending("");
      }
    },
    [refresh],
  );

  const resume = useCallback(
    async (source: string) => {
      try {
        const result = await requestJson<{ detail: string }>(
          `/api/admin/sources/${source}/resume`,
          jsonRequest("POST"),
        );

        setMessage(result.detail);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not resume that source.");
      }
    },
    [refresh],
  );

  const changeRole = useCallback(async (userId: string, role: UserRole) => {
    try {
      const result = await requestJson<{ users: AdminUser[] }>(
        `/api/admin/users/${userId}/role`,
        jsonRequest("POST", { role }),
      );

      setUsers(result.users);
      setMessage(`Role updated to ${role}`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change that role.");
    }
  }, []);

  return { changeRole, error, message, overview, pending, refresh, resume, run, users };
}

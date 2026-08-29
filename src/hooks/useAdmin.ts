import { useCallback, useEffect, useState } from "react";

import type { AdminAction } from "../domain/admin";

export type { AdminAction };

import { jsonMutation, mutateJson, queryJson } from "../lib/query-client";
import type { UserRole } from "../types";

export type AdminOverview = {
  catalogue: Record<string, number>;
  backfill: {
    mediaType: string;
    status: string;
    partitions: number;
    titles: number;
    pagesDone: number;
    totalPages: number;
  }[];
  budgets: {
    source: string;
    callLimit: number;
    used: number;
    windowKind: string;
    pausedUntil: string | null;
    consecutivePauses: number;
  }[];
  fetchedAt: string;
};

export type AdminPipeline = {
  enrichment: {
    source: string;
    titles: number;
    misses: number;
    pending: number;
    newest: string;
    attempted: number;
    silentFailures: number;
  }[];
  readiness: {
    search: {
      titles: number;
      indexed: number;
      pending: number;
      oldestPendingAt: string | null;
    };
    embeddings: {
      model: string;
      titles: number;
      embedded: number;
      outstanding: number;
      retrying: number;
      otherModels: number;
      newest: string | null;
    };
  };
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
  fetchedAt: string;
};

export type AdminListings = {
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
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);

    try {
      setOverview(await queryJson<AdminOverview>("/api/admin/overview"));
      setError("");
    } catch {
      setError("Could not read the admin panel.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const loadUsers = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const next = await queryJson<{ users: AdminUser[] }>("/api/admin/users");

      setUsers(next.users);
      setUsersLoaded(true);
      setError("");
    } catch {
      setError("Could not read the user list.");
    }
  }, [enabled]);

  const run = useCallback(
    async (action: AdminAction) => {
      setPending(action);
      setMessage("");

      try {
        const result = await mutateJson<{ detail: string }>(
          `/api/admin/actions/${action}`,
          jsonMutation("POST"),
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
        const result = await mutateJson<{ detail: string }>(
          `/api/admin/sources/${source}/resume`,
          jsonMutation("POST"),
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
      const result = await mutateJson<{ users: AdminUser[] }>(
        `/api/admin/users/${userId}/role`,
        jsonMutation("POST", { role }),
      );

      setUsers(result.users);
      setMessage(`Role updated to ${role}`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change that role.");
    }
  }, []);

  return {
    changeRole,
    error,
    loading,
    loadUsers,
    message,
    overview,
    pending,
    refresh,
    resume,
    run,
    users,
    usersLoaded,
  };
}

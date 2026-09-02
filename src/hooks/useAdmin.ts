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
  sources: SourceHealth[];
  fetchedAt: string;
};

export type SourceHealth = {
  source: string;
  label: string;
  kind: string;
  powers: string;
  optional: boolean;
  enforced: boolean;
  credential: string | null;
  credentialState: "configured" | "missing" | "open";
  windowKind: string;
  callLimit: number;
  claimed: number;
  pausedUntil: string | null;
  consecutivePauses: number;
  calls: number;
  failures: number;
  averageLatencyMs: number;
  lastStatus: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  sampled: boolean;
  state: "healthy" | "degraded" | "failing" | "paused" | "unconfigured" | "idle";
};

export type AdminProviders = {
  providers: {
    id: string;
    name: string;
    category: string;
    capabilities: string[];
    state: "live" | "stale" | "unresolved" | "out-of-scope" | "failed";
    reason: string | null;
    titles: number;
    tmdbProviderIds: number[];
    homepage: string | null;
  }[];
  unmapped: { providerId: string; name: string; titles: number; resolvesNow: string | null }[];
  errors: { source: string; detail: string }[];
  stats: {
    configured: number;
    live: number;
    stale: number;
    unresolved: number;
    outOfScope: number;
    failed: number;
    longTail: number;
    titlesCovered: number;
  } | null;
  sources: string[];
  fetchedAt: string | null;
};

export type AdminPipeline = {
  searchDrift: number;
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
      sampled: number;
      stale: number;
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

export type AdminQuality = {
  angles: {
    angle: string;
    impressions: number;
    clicks: number;
    views: number;
    exits: number;
    watched: number;
    attrition: number;
    dwellMs: number;
    score: number;
  }[];
  decisions: {
    feature: string;
    decisions: number;
    served: number;
    barren: number;
    failed: number;
    fellBack: number;
    candidates: number;
    latencyMs: number;
    costUsd: number;
    followed: number;
    refused: number;
  }[];
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

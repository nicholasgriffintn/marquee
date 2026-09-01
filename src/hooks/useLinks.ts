import { useCallback, useEffect, useState } from "react";

import type { AgentScope, ApiScope } from "../domain/scopes";
import { jsonMutation, mutateJson, queryJson } from "../lib/query-client";

export type AccountLink = {
  provider: "trakt";
  connected: boolean;
  available: boolean;
  account: string | null;
  syncedAt: string | null;
  needsReconnect: boolean;
};

export type ApiToken = {
  id: string;
  label: string;
  scopes: ApiScope[];
  fullAccess: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type TraktPending = {
  pushedAt: string | null;
  watched: number;
  listed: number;
  rated: number;
};

export type TraktJobStatus = "idle" | "running" | "done" | "timeout";

const POLL_INTERVAL_MS = 3_000;
const POLL_ATTEMPTS = 15;

async function pollUntil(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    if (await check()) {
      return true;
    }

    if (attempt < POLL_ATTEMPTS - 1) {
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  return false;
}

export function useLinks(isSignedIn: boolean) {
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [freshToken, setFreshToken] = useState("");
  const [pending, setPending] = useState<TraktPending | null>(null);
  const [pushStatus, setPushStatus] = useState<TraktJobStatus>("idle");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!isSignedIn) {
      return;
    }

    try {
      const [linkResponse, tokenResponse] = await Promise.all([
        queryJson<{ links: AccountLink[] }>("/api/links"),
        queryJson<{ tokens: ApiToken[] }>("/api/auth/tokens"),
      ]);

      setLinks(linkResponse.links);
      setTokens(tokenResponse.tokens);

      if (linkResponse.links.some((link) => link.provider === "trakt" && link.connected)) {
        setPending(await queryJson<TraktPending>("/api/links/trakt/push"));
      }
    } catch {
      setError("Could not read your connected accounts.");
    }
  }, [isSignedIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);

    return () => window.clearTimeout(timer);
  }, [reload]);

  const pushTrakt = useCallback(async () => {
    setError("");
    setPushStatus("running");

    try {
      const response = await mutateJson<TraktPending & { queued: boolean }>(
        "/api/links/trakt/push",
        jsonMutation("POST"),
      );

      if (!response.queued) {
        setError("Nothing new to send since the last time.");
        setPushStatus("idle");

        return;
      }

      const before = response.pushedAt;
      const finished = await pollUntil(async () => {
        const preview = await queryJson<TraktPending>("/api/links/trakt/push");

        if (!preview.pushedAt || preview.pushedAt === before) {
          return false;
        }

        setPending(preview);

        return true;
      });

      setPushStatus(finished ? "done" : "timeout");
    } catch {
      setError("Could not send your shelf to Trakt.");
      setPushStatus("idle");
    }
  }, []);

  const unlinkTrakt = useCallback(async () => {
    setError("");

    try {
      await mutateJson("/api/links/trakt", jsonMutation("DELETE"));
      await reload();
    } catch {
      setError("Could not unlink Trakt.");
    }
  }, [reload]);

  const createToken = useCallback(
    async (label: string, scopes: readonly AgentScope[]) => {
      setError("");

      try {
        const created = await mutateJson<{ token: string }>(
          "/api/auth/tokens",
          jsonMutation("POST", { label, scopes }),
        );

        setFreshToken(created.token);
        await reload();
      } catch {
        setError("Could not create the token.");
      }
    },
    [reload],
  );

  const revokeToken = useCallback(
    async (id: string) => {
      setError("");

      try {
        await mutateJson(`/api/auth/tokens/${id}`, jsonMutation("DELETE"));
        await reload();
      } catch {
        setError("Could not revoke the token.");
      }
    },
    [reload],
  );

  return {
    links,
    tokens,
    freshToken,
    pending,
    pushStatus,
    error,
    createToken,
    revokeToken,
    pushTrakt,
    unlinkTrakt,
    dismissToken: () => setFreshToken(""),
  };
}

import { useCallback, useEffect, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";

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
  const [syncStatus, setSyncStatus] = useState<TraktJobStatus>("idle");
  const [pushStatus, setPushStatus] = useState<TraktJobStatus>("idle");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!isSignedIn) {
      return;
    }

    try {
      const [linkResponse, tokenResponse] = await Promise.all([
        requestJson<{ links: AccountLink[] }>("/api/links"),
        requestJson<{ tokens: ApiToken[] }>("/api/auth/tokens"),
      ]);

      setLinks(linkResponse.links);
      setTokens(tokenResponse.tokens);

      if (linkResponse.links.some((link) => link.provider === "trakt" && link.connected)) {
        setPending(await requestJson<TraktPending>("/api/links/trakt/push"));
      }
    } catch {
      setError("Could not read your connected accounts.");
    }
  }, [isSignedIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);

    return () => window.clearTimeout(timer);
  }, [reload]);

  const syncTrakt = useCallback(async () => {
    setError("");
    setSyncStatus("running");

    try {
      await requestJson("/api/links/trakt/sync", jsonRequest("POST"));

      const before = links.find((link) => link.provider === "trakt")?.syncedAt ?? null;
      const finished = await pollUntil(async () => {
        const response = await requestJson<{ links: AccountLink[] }>("/api/links");
        const trakt = response.links.find((link) => link.provider === "trakt");

        if (!trakt?.syncedAt || trakt.syncedAt === before) {
          return false;
        }

        setLinks(response.links);

        return true;
      });

      setSyncStatus(finished ? "done" : "timeout");
    } catch {
      setError("Could not start the Trakt sync.");
      setSyncStatus("idle");
    }
  }, [links]);

  const pushTrakt = useCallback(async () => {
    setError("");
    setPushStatus("running");

    try {
      const response = await requestJson<TraktPending & { queued: boolean }>(
        "/api/links/trakt/push",
        jsonRequest("POST"),
      );

      if (!response.queued) {
        setError("Nothing new to send since the last time.");
        setPushStatus("idle");

        return;
      }

      const before = response.pushedAt;
      const finished = await pollUntil(async () => {
        const preview = await requestJson<TraktPending>("/api/links/trakt/push");

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
      await requestJson("/api/links/trakt", jsonRequest("DELETE"));
      await reload();
    } catch {
      setError("Could not unlink Trakt.");
    }
  }, [reload]);

  const createToken = useCallback(
    async (label: string) => {
      setError("");

      try {
        const created = await requestJson<{ token: string }>(
          "/api/auth/tokens",
          jsonRequest("POST", { label }),
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
        await requestJson(`/api/auth/tokens/${id}`, jsonRequest("DELETE"));
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
    syncStatus,
    pushStatus,
    error,
    createToken,
    revokeToken,
    syncTrakt,
    pushTrakt,
    unlinkTrakt,
    dismissToken: () => setFreshToken(""),
  };
}

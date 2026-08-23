import { useCallback, useEffect, useState } from "react";

import { jsonRequest, requestJson } from "../lib/api";

export type AccountLink = {
  provider: "trakt";
  connected: boolean;
  available: boolean;
  account: string | null;
  syncedAt: string | null;
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

export function useLinks(isSignedIn: boolean) {
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [freshToken, setFreshToken] = useState("");
  const [pending, setPending] = useState<TraktPending | null>(null);
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

    try {
      await requestJson("/api/links/trakt/sync", jsonRequest("POST"));
      await reload();
    } catch {
      setError("Could not start the Trakt sync.");
    }
  }, [reload]);

  const pushTrakt = useCallback(async () => {
    setError("");

    try {
      const response = await requestJson<{ queued: boolean }>(
        "/api/links/trakt/push",
        jsonRequest("POST"),
      );

      if (!response.queued) {
        setError("Nothing new to send since the last time.");

        return;
      }

      setPending({ pushedAt: new Date().toISOString(), watched: 0, listed: 0, rated: 0 });
    } catch {
      setError("Could not send your shelf to Trakt.");
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
    error,
    createToken,
    revokeToken,
    syncTrakt,
    pushTrakt,
    unlinkTrakt,
    dismissToken: () => setFreshToken(""),
  };
}

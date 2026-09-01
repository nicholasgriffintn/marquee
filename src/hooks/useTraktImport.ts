import { useCallback, useEffect, useState } from "react";

import { jsonMutation, mutateJson, queryJsonFresh } from "../lib/query-client";

export type TraktImportLink = {
  provider: "trakt";
  connected: boolean;
  available: boolean;
  account: string | null;
  syncedAt: string | null;
  needsReconnect: boolean;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_ATTEMPTS = 30;

async function readTraktLink() {
  const response = await queryJsonFresh<{ links: TraktImportLink[] }>("/api/links");

  return response.links.find((link) => link.provider === "trakt") ?? null;
}

export function useTraktImport(isSignedIn: boolean, onFinished: () => Promise<void>) {
  const [link, setLink] = useState<TraktImportLink | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "timeout">("idle");
  const [error, setError] = useState("");
  const syncedAt = link?.syncedAt ?? null;

  const reload = useCallback(async () => {
    if (isSignedIn) {
      setLink(await readTraktLink());
    }
  }, [isSignedIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload().catch(() => undefined), 0);

    return () => window.clearTimeout(timer);
  }, [reload]);

  const sync = useCallback(async () => {
    setError("");
    setStatus("running");

    try {
      const before = syncedAt;

      await mutateJson("/api/links/trakt/sync", jsonMutation("POST"));

      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- poll one user-owned provider connection
        const current = await readTraktLink();

        setLink(current);

        if (current?.syncedAt && current.syncedAt !== before) {
          setStatus("done");
          void onFinished();

          return;
        }

        if (attempt < POLL_ATTEMPTS - 1) {
          // oxlint-disable-next-line no-await-in-loop -- bounded polling interval
          await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      setStatus("timeout");
      void onFinished();
    } catch {
      setError("The Trakt import could not be started.");
      setStatus("idle");
    }
  }, [onFinished, syncedAt]);

  return { link, status, error, sync };
}

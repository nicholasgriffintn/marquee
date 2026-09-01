import { useCallback, useEffect, useState } from "react";

import { IMPORT_RECORD_BATCH_LIMIT, type ImportRun, type ImportRunDetail } from "../domain/imports";
import type { ParsedImport } from "../importers/types";
import { jsonMutation, mutateJson, queryJsonFresh } from "../lib/query-client";

const POLL_INTERVAL_MS = 1_500;
const POLL_ATTEMPTS = 80;

async function waitForRun(runId: string, finished: (run: ImportRun) => boolean) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- poll one stable server-side run
    const detail = await queryJsonFresh<ImportRunDetail>(`/api/profile/imports/${runId}`);

    if (finished(detail.run)) {
      return detail;
    }

    if (attempt < POLL_ATTEMPTS - 1) {
      // oxlint-disable-next-line no-await-in-loop -- bounded polling interval
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  return null;
}

export function useImports(onImported: () => void) {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [active, setActive] = useState<ImportRunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const reload = useCallback(async () => {
    const response = await queryJsonFresh<{ runs: ImportRun[] }>("/api/profile/imports");

    setRuns(response.runs);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload().catch(() => undefined), 0);
    const timer = window.setInterval(() => void reload().catch(() => undefined), 10_000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [reload]);

  const submit = useCallback(
    async (parsed: ParsedImport) => {
      setBusy(true);
      setError("");

      try {
        const created = await mutateJson<{ run: ImportRun }>(
          "/api/profile/imports",
          jsonMutation("POST", {
            source: parsed.source,
            sourceSubject: parsed.sourceSubject,
            inputKind: parsed.inputKind,
            adapterId: parsed.adapterId,
            adapterVersion: parsed.adapterVersion,
            inputFingerprint: parsed.inputFingerprint,
          }),
        );

        if (created.run.status !== "staging") {
          const existing = await queryJsonFresh<ImportRunDetail>(
            `/api/profile/imports/${created.run.id}`,
          );

          setActive(existing);
          await reload();

          return;
        }

        for (let index = 0; index < parsed.records.length; index += IMPORT_RECORD_BATCH_LIMIT) {
          setProgress(
            `Staging ${Math.min(index + IMPORT_RECORD_BATCH_LIMIT, parsed.records.length)} of ${parsed.records.length}…`,
          );
          // oxlint-disable-next-line no-await-in-loop -- ordered chunks make upload progress resumable
          await mutateJson(
            `/api/profile/imports/${created.run.id}/records`,
            jsonMutation("POST", {
              records: parsed.records.slice(index, index + IMPORT_RECORD_BATCH_LIMIT),
            }),
          );
        }

        setProgress("Matching titles…");
        await mutateJson(`/api/profile/imports/${created.run.id}/preview`, jsonMutation("POST"));
        const detail = await waitForRun(created.run.id, (run) =>
          ["ready", "needs_review", "failed"].includes(run.status),
        );

        if (!detail) {
          throw new Error("Matching is still running. The import remains in your history.");
        }

        setActive(detail);
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That import did not take.");
      } finally {
        setBusy(false);
        setProgress("");
      }
    },
    [reload],
  );

  const open = useCallback(async (runId: string, offset = 0) => {
    setError("");

    try {
      setActive(
        await queryJsonFresh<ImportRunDetail>(`/api/profile/imports/${runId}?offset=${offset}`),
      );
    } catch {
      setError("I could not open that import.");
    }
  }, []);

  const resolve = useCallback(
    async (recordId: string, resolution: { titleId?: string; ignore?: boolean }) => {
      if (!active) {
        return;
      }

      setBusy(true);
      setError("");

      try {
        await mutateJson(
          `/api/profile/imports/${active.run.id}/records/${recordId}`,
          jsonMutation("PATCH", resolution),
        );
        setActive(await queryJsonFresh<ImportRunDetail>(`/api/profile/imports/${active.run.id}`));
        await reload();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That match did not stick.");
      } finally {
        setBusy(false);
      }
    },
    [active, reload],
  );

  const commit = useCallback(async () => {
    if (!active) {
      return;
    }

    setBusy(true);
    setError("");
    setProgress("Writing your history…");

    try {
      await mutateJson(`/api/profile/imports/${active.run.id}/commit`, jsonMutation("POST"));
      const detail = await waitForRun(active.run.id, (run) =>
        ["completed", "failed"].includes(run.status),
      );

      if (!detail) {
        throw new Error("The import is still running. It remains in your history.");
      }

      setActive(detail);
      await reload();
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That import did not finish.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [active, onImported, reload]);

  const remove = useCallback(
    async (runId: string) => {
      setBusy(true);
      setError("");

      try {
        await mutateJson(`/api/profile/imports/${runId}`, jsonMutation("DELETE"));
        setActive((current) => (current?.run.id === runId ? null : current));
        await reload();
        onImported();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That import could not be removed.");
      } finally {
        setBusy(false);
      }
    },
    [onImported, reload],
  );

  return {
    runs,
    active,
    busy,
    error,
    progress,
    submit,
    open,
    page: open,
    resolve,
    commit,
    remove,
    refresh: reload,
    close: () => setActive(null),
  };
}

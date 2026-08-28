import { useState } from "react";

import { classNames } from "../../lib/class-names";
import { dedupeRows, parseLetterboxdCsv } from "../../lib/letterboxd";
import { jsonMutation, mutateJson } from "../../lib/query-client";

import styles from "./ImportPanel.module.css";

const BATCH = 100;

export function ImportPanel({ onImported }: { onImported: () => void }) {
  const [status, setStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  async function importCsv(files: FileList | null) {
    setIsImporting(true);

    try {
      const rows = dedupeRows(
        (await Promise.all([...(files ?? [])].map((file) => file.text()))).flatMap((text) =>
          parseLetterboxdCsv(text),
        ),
      );

      if (rows.length === 0) {
        setStatus(
          "Nothing I recognised in that. Letterboxd gives you a folder of them — I want diary.csv or ratings.csv.",
        );

        return;
      }

      let matched = 0;
      let queued = 0;
      let failedBatches = 0;

      for (let index = 0; index < rows.length; index += BATCH) {
        setStatus(`Reading ${Math.min(index + BATCH, rows.length)} of ${rows.length}…`);

        try {
          // oxlint-disable-next-line no-await-in-loop -- batches must post in order so status/progress stays accurate
          const outcome = await mutateJson<{
            matched: number;
            queued: number;
          }>(
            "/api/profile/import/letterboxd",
            jsonMutation("POST", { rows: rows.slice(index, index + BATCH) }),
          );

          matched += outcome.matched;
          queued += outcome.queued;
        } catch {
          failedBatches += 1;
        }
      }

      setStatus(
        `${matched} of ${rows.length} seated straight away.${
          queued > 0 ? ` ${queued} I have sent for — they will turn up over the next hour.` : ""
        }${failedBatches > 0 ? " Some rows didn't make it through — try the file again in a moment." : ""}`,
      );
      onImported();
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      <label className={classNames(styles.drop, isImporting && styles.busy)}>
        <input
          className={styles.input}
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={isImporting}
          onChange={(event) => void importCsv(event.target.files)}
        />
        <span className={styles.label}>{isImporting ? "Reading…" : "Hand it over"}</span>
      </label>
      {status && (
        <p className={styles.status} aria-live="polite">
          {status}
        </p>
      )}
    </>
  );
}

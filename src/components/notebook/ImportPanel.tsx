import { useState } from "react";

import { jsonRequest, requestJson } from "../../lib/api";
import { dedupeRows, parseLetterboxdCsv } from "../../lib/letterboxd";

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
          const outcome = await requestJson<{ matched: number; queued: number }>(
            "/api/profile/import/letterboxd",
            jsonRequest("POST", { rows: rows.slice(index, index + BATCH) }),
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
      <label className={`notebook-import${isImporting ? " busy" : ""}`}>
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={isImporting}
          onChange={(event) => void importCsv(event.target.files)}
        />
        <span>{isImporting ? "Reading…" : "Hand it over"}</span>
      </label>
      {status && <p className="notebook-import-status">{status}</p>}
    </>
  );
}

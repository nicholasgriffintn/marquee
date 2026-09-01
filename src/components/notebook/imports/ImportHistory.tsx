import type { ImportRun } from "../../../domain/imports";
import { formatDate } from "../../../lib/dates";
import { Button } from "../../../ui";

import styles from "./imports.module.css";

export function ImportHistory({
  runs,
  busy,
  onOpen,
  onRemove,
}: {
  runs: ImportRun[];
  busy: boolean;
  onOpen: (runId: string) => Promise<void>;
  onRemove: (runId: string) => Promise<void>;
}) {
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className={styles.history}>
      <h3>Previous imports</h3>
      {runs.map((run) => (
        <article key={run.id}>
          <button type="button" onClick={() => void onOpen(run.id)}>
            <strong>{run.source.replaceAll("-", " ")}</strong>
            <small>
              {formatDate(run.createdAt, {})} · {run.status.replaceAll("_", " ")} ·{" "}
              {run.committed || run.matched} records
            </small>
          </button>
          <Button
            variant="quiet"
            size="sm"
            disabled={busy || run.status === "committing"}
            onClick={() => {
              if (window.confirm("Remove this import and rebuild the affected shelf entries?")) {
                void onRemove(run.id);
              }
            }}
          >
            Remove
          </Button>
        </article>
      ))}
    </div>
  );
}

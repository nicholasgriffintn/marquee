import { useState } from "react";

import { missingEvidence, type Belief, type BeliefEvidenceNote } from "../../domain/notebook";
import { useResource } from "../../hooks/useResource";
import { parseDatabaseDate } from "../../lib/dates";

import styles from "./BeliefEvidence.module.css";

type EvidenceResponse = { notes: BeliefEvidenceNote[] };

function notedOn(value: string) {
  return (
    parseDatabaseDate(value)?.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) ?? ""
  );
}

export function BeliefEvidence({ belief }: { belief: Belief }) {
  const [open, setOpen] = useState(false);
  const { data, error, isLoading } = useResource<EvidenceResponse>(
    open ? `/api/notebook/${belief.id}/evidence` : null,
    { errorMessage: "Those notes are out of reach for a moment." },
  );
  const notes = data?.notes ?? [];
  const short = missingEvidence(belief);

  return (
    <div className={styles.evidence}>
      {short > 0 && (
        <p className={styles.pending}>
          Not steering anything yet. {short === 1 ? "One more note" : `${short} more notes`} saying
          the same and I will start using it.
        </p>
      )}
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide what this came from" : "Show what this came from"}
      </button>
      {open && (
        <div className={styles.panel}>
          {isLoading && <p className={styles.status}>Turning back the pages…</p>}
          {error && (
            <p className={styles.status} role="alert">
              {error}
            </p>
          )}
          {!isLoading && !error && notes.length === 0 && (
            <p className={styles.status}>Nothing on this one, so I will let it lapse.</p>
          )}
          {notes.length > 0 && (
            <ul className={styles.notes}>
              {notes.map((note) => (
                <li key={note.id}>
                  <strong>{note.title}</strong>
                  <span>{notedOn(note.notedAt)}</span>
                  <q>{note.excerpt}</q>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

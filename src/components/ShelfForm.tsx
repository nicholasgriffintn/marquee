import { useEffect, useRef, useState } from "react";

import { runConfirmedRemoval } from "../domain/profile-entry";
import { classNames } from "../lib/class-names";
import { isEntryStatus, type EntryStatus, type ViewingEntry } from "../types";
import { Button, Eyebrow, StarIcon, Text, TextArea } from "../ui";

import styles from "./ShelfForm.module.css";

const STATUSES: { value: EntryStatus; label: string }[] = [
  { value: "watchlist", label: "On my watchlist" },
  { value: "watching", label: "Watching" },
  { value: "watched", label: "Watched" },
  { value: "dropped", label: "Dropped" },
];

const PENDING_MS = 2_500;

export function ShelfForm({
  entry,
  title,
  isSeries = false,
  confirmRemove,
  onRemove,
  onSave,
  onStatus,
  onUpdateDraft,
}: {
  entry: ViewingEntry;
  title: string;
  isSeries?: boolean;
  confirmRemove: () => boolean;
  onRemove: (titleId: string) => void;
  onSave: (entry: ViewingEntry) => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
}) {
  const [pending, setPending] = useState<"save" | "remove" | null>(null);
  const guardRef = useRef(false);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function guard(kind: "save" | "remove", run: () => void) {
    if (guardRef.current) {
      return;
    }

    guardRef.current = true;
    setPending(kind);
    run();
    timerRef.current = window.setTimeout(() => {
      guardRef.current = false;
      setPending(null);
    }, PENDING_MS);
  }

  return (
    <div className={styles.form}>
      <Eyebrow size="sm" weight="heavy" tracking="wide" tone="inkMuted">
        On your shelf
      </Eyebrow>
      {isSeries && (
        <Text size="xs" tone="inkMuted" italic className={styles.scope}>
          The whole show. Individual episodes and runs keep their own marks above.
        </Text>
      )}

      <label className={styles.status}>
        Watch status
        <select
          value={entry.status}
          onChange={(event) => {
            if (isEntryStatus(event.target.value)) {
              onStatus(entry.titleId, event.target.value);
            }
          }}
        >
          {STATUSES.map((status) => (
            <option value={status.value} key={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.rating} aria-label={`Rate ${title}`}>
        <span className={styles.ratingLabel}>Your rating</span>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            type="button"
            key={rating}
            className={classNames(styles.star, (entry.rating ?? 0) >= rating && styles.starOn)}
            aria-pressed={entry.rating === rating}
            onClick={() =>
              onSave({
                ...entry,
                status: entry.status === "watchlist" ? "watched" : entry.status,
                rating,
              })
            }
            aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
          >
            <StarIcon />
          </button>
        ))}
      </div>

      <TextArea
        surface="paper"
        maxLength={2_000}
        value={entry.thoughts}
        onChange={(event) => onUpdateDraft(entry.titleId, { thoughts: event.target.value })}
        placeholder="Your notes on this one"
        aria-label={`Notes about ${title}`}
      />

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          surface="paper"
          disabled={pending !== null}
          onClick={() => guard("save", () => onSave(entry))}
        >
          {pending === "save" ? "Saving…" : "Save note"}
        </Button>
        <Button
          variant="danger"
          size="lg"
          surface="paper"
          disabled={pending !== null}
          onClick={() =>
            runConfirmedRemoval(confirmRemove, () => guard("remove", () => onRemove(entry.titleId)))
          }
        >
          {pending === "remove" ? "Removing…" : "Remove from shelf"}
        </Button>
      </div>
    </div>
  );
}

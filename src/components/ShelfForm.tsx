import { useEffect, useRef, useState } from "react";

import { isEntryStatus, type EntryStatus, type ViewingEntry } from "../types";

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
  onRemove,
  onSave,
  onStatus,
  onUpdateDraft,
}: {
  entry: ViewingEntry;
  title: string;
  isSeries?: boolean;
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
    <div className="shelf-form">
      <span className="shelf-form-label">On your shelf</span>
      {isSeries && (
        <p className="shelf-form-scope">
          The whole show. Individual episodes and runs keep their own marks above.
        </p>
      )}

      <label className="status-input">
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

      <div className="rating-input" aria-label={`Rate ${title}`}>
        <span>Your rating</span>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            type="button"
            key={rating}
            className={(entry.rating ?? 0) >= rating ? "active" : ""}
            onClick={() =>
              onSave({
                ...entry,
                status: entry.status === "watchlist" ? "watched" : entry.status,
                rating,
              })
            }
            aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        maxLength={2_000}
        value={entry.thoughts}
        onChange={(event) => onUpdateDraft(entry.titleId, { thoughts: event.target.value })}
        placeholder="Your notes on this one"
        aria-label={`Notes about ${title}`}
      />

      <div className="shelf-form-actions">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => guard("save", () => onSave(entry))}
        >
          {pending === "save" ? "Saving…" : "Save note"}
        </button>
        <button
          type="button"
          className="danger"
          disabled={pending !== null}
          onClick={() => guard("remove", () => onRemove(entry.titleId))}
        >
          {pending === "remove" ? "Removing…" : "Remove from shelf"}
        </button>
      </div>
    </div>
  );
}

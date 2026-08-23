import { isEntryStatus, type EntryStatus, type ViewingEntry } from "../types";

const STATUSES: { value: EntryStatus; label: string }[] = [
  { value: "watchlist", label: "On my watchlist" },
  { value: "watching", label: "Watching" },
  { value: "watched", label: "Watched" },
  { value: "dropped", label: "Dropped" },
];

export function ShelfForm({
  entry,
  title,
  isSeries = false,
  seasons,
  onRemove,
  onSave,
  onStatus,
  onUpdateDraft,
}: {
  entry: ViewingEntry;
  title: string;
  isSeries?: boolean;
  seasons?: number | null;
  onRemove: (titleId: string) => void;
  onSave: (entry: ViewingEntry) => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
}) {
  return (
    <div className="shelf-form">
      <span className="shelf-form-label">On your shelf</span>

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

      {isSeries && (
        <div className="progress-input">
          <span>Where you are</span>
          <label>
            Series
            <input
              type="number"
              min={1}
              max={seasons ?? 100}
              value={entry.season ?? ""}
              onChange={(event) =>
                onUpdateDraft(entry.titleId, {
                  season: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </label>
          <label>
            Episode
            <input
              type="number"
              min={1}
              max={500}
              value={entry.episode ?? ""}
              onChange={(event) =>
                onUpdateDraft(entry.titleId, {
                  episode: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </label>
          {seasons ? <small>of {seasons} so far</small> : null}
        </div>
      )}

      <textarea
        maxLength={2_000}
        value={entry.thoughts}
        onChange={(event) => onUpdateDraft(entry.titleId, { thoughts: event.target.value })}
        placeholder="Your notes on this one"
        aria-label={`Notes about ${title}`}
      />

      <div className="shelf-form-actions">
        <button type="button" onClick={() => onSave(entry)}>
          Save note
        </button>
        <button type="button" className="danger" onClick={() => onRemove(entry.titleId)}>
          Remove from shelf
        </button>
      </div>
    </div>
  );
}

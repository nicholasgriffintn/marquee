import { ArrowIcon, Poster } from "../components/ui";
import type { MediaTitle } from "../domain/catalog";
import { mediaMeta } from "../lib/media";
import { isEntryStatus, type EntryStatus, type ViewingEntry } from "../types";

const statuses: Array<{ value: EntryStatus; label: string }> = [
  { value: "watchlist", label: "On my watchlist" },
  { value: "watching", label: "Watching" },
  { value: "watched", label: "Watched" },
  { value: "dropped", label: "Dropped" },
];

export function LibraryPage({
  entries,
  titles,
  catalogueError,
  onOpen,
  onRemove,
  onSave,
  onShowTonight,
  onStatus,
  onUpdateDraft,
}: {
  entries: Record<string, ViewingEntry>;
  titles: MediaTitle[];
  catalogueError: string;
  onOpen: (item: MediaTitle) => void;
  onRemove: (titleId: string) => void;
  onSave: (entry: ViewingEntry) => void;
  onShowTonight: () => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
}) {
  const savedCount = Object.keys(entries).length;

  return (
    <section className="page-section library-page">
      <div className="page-title-row">
        <div>
          <h1>
            Everything you’ve <em>saved and watched.</em>
          </h1>
        </div>
        <p>
          Ratings and notes stay in your account. They’re used to shape your recommendations and
          nothing else.
        </p>
      </div>
      {catalogueError && savedCount > 0 && !titles.length && (
        <p className="catalogue-error" role="alert">
          We couldn’t load your saved titles. Try again in a moment.
        </p>
      )}
      <div className="library-grid">
        {titles.map((item) => {
          const entry = entries[item.id];

          if (!entry) {
            return null;
          }

          return (
            <article className="library-item" key={item.id}>
              <Poster item={item} />
              <div>
                <label className="status-input">
                  WATCH STATUS
                  <select
                    value={entry.status}
                    onChange={(event) => {
                      if (isEntryStatus(event.target.value)) {
                        onStatus(item.id, event.target.value);
                      }
                    }}
                  >
                    {statuses.map((status) => (
                      <option value={status.value} key={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <h2>{item.title}</h2>
                <p className="library-meta">{mediaMeta(item)}</p>
                <p>{item.overview || "No synopsis available."}</p>
                <div className="rating-input" aria-label={`Rate ${item.title}`}>
                  <span>YOUR RATING</span>
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
                  onChange={(event) => onUpdateDraft(item.id, { thoughts: event.target.value })}
                  placeholder="Your notes on this one"
                  aria-label={`Notes about ${item.title}`}
                />
                <div className="library-actions">
                  <button type="button" onClick={() => onSave(entries[item.id])}>
                    Save note
                  </button>
                  <button type="button" className="secondary" onClick={() => onOpen(item)}>
                    Open details <ArrowIcon />
                  </button>
                  <button type="button" className="danger" onClick={() => onRemove(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!savedCount && (
          <div className="empty-library">
            <strong>Nothing on your shelf yet.</strong>
            <p>Save something from Tonight to rate it and keep notes here.</p>
            <button type="button" onClick={onShowTonight}>
              Find something <ArrowIcon />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

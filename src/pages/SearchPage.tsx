import { Link } from "react-router-dom";

import { TitleCard } from "../components/catalog";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import type { UsherMoment } from "../domain/usher";

export function SearchPage({
  query,
  items,
  error,
  isSearching,
  usherMoment,
  onOpen,
  onShowTonight,
  onUsherAction,
  onUsherDismiss,
}: {
  query: string;
  items: MediaTitle[];
  error: string;
  isSearching: boolean;
  usherMoment: UsherMoment | null;
  onOpen: (item: MediaTitle) => void;
  onShowTonight: () => void;
  onUsherAction: (moment: UsherMoment, actionId: string) => void;
  onUsherDismiss: (scope: "once" | "kind") => void;
}) {
  const trimmed = query.trim();
  const isLookingForHim = /^(the\s+)?usher$/iu.test(trimmed);
  const pendingCount = items.filter((item) => item.pending).length;
  const showSkeleton = isSearching && items.length === 0 && trimmed.length > 1;

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <h1>{trimmed ? `“${trimmed}”` : "Search"}</h1>
        </div>
        <p>
          {error
            ? error
            : isSearching
              ? "Searching the catalogue…"
              : trimmed
                ? `${items.length} result${items.length === 1 ? "" : "s"}${
                    pendingCount ? ` · ${pendingCount} being fetched` : ""
                  }`
                : "Type a film or show name to search."}
        </p>
      </div>

      {isLookingForHim && (
        <Link className="search-usher" to="/usher">
          <UsherMark face="pleased" crop="head" />
          <span>
            <strong>The Usher</strong>
            <small>Thirty years on the door. Not in the catalogue, but he is here.</small>
          </span>
          <em aria-hidden="true">→</em>
        </Link>
      )}

      {items.length > 0 && (
        <ErrorBoundary label="These results">
          <div className="results-grid">
            {items.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </ErrorBoundary>
      )}

      {showSkeleton && (
        <div className="results-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((card) => (
            <div className="rail-card" key={card}>
              <span className="skeleton skeleton-art" />
              <span className="skeleton skeleton-meta" />
            </div>
          ))}
        </div>
      )}

      {!isSearching && trimmed.length > 1 && items.length === 0 && !error && (
        <div className="search-empty">
          <h2>Nothing found for “{trimmed}”.</h2>
          <p>
            Marquee searched its own catalogue and OMDb. Try a different spelling, or browse what’s
            on tonight.
          </p>
          <button type="button" onClick={onShowTonight}>
            Back to tonight
          </button>
          {usherMoment && (
            <UsherCard moment={usherMoment} onAction={onUsherAction} onDismiss={onUsherDismiss} />
          )}
        </div>
      )}
    </section>
  );
}

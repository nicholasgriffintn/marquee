import { TitleCard } from "../components/catalog";
import type { MediaTitle } from "../domain/catalog";

export function SearchPage({
  query,
  items,
  error,
  isSearching,
  onOpen,
  onShowTonight,
}: {
  query: string;
  items: MediaTitle[];
  error: string;
  isSearching: boolean;
  onOpen: (item: MediaTitle) => void;
  onShowTonight: () => void;
}) {
  const trimmed = query.trim();
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

      {items.length > 0 && (
        <div className="results-grid">
          {items.map((item) => (
            <TitleCard key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
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
        </div>
      )}
    </section>
  );
}

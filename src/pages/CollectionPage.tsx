import { useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { TitleCard } from "../components/TitleCard";
import type { MediaTitle } from "../domain/catalog";
import { useCollectionPage } from "../hooks/useCollection";

export function CollectionPage({ onOpen }: { onOpen: (item: MediaTitle) => void }) {
  const params = useParams();
  const collectionId = Number(params.id);
  const validId = Number.isInteger(collectionId) && collectionId > 0 ? collectionId : null;
  const { items, hasMore, isLoading, error, loadMore } = useCollectionPage(validId);
  const name = items[0]?.collection?.name ?? "";

  return (
    <section className="page-section">
      <PageTitle heading={name || "Collection"}>
        <p>
          {items.length > 0
            ? `${items.length}${hasMore ? "+" : ""} title${items.length === 1 ? "" : "s"} in the collection.`
            : "Every film in this collection, in one place."}
        </p>
      </PageTitle>

      {(error || !validId) && (
        <p className="auth-message" role="alert">
          {error || "That collection does not exist."}
        </p>
      )}

      {items.length > 0 && (
        <ErrorBoundary label="This collection">
          <div className="results-grid">
            {items.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </ErrorBoundary>
      )}

      {isLoading && items.length === 0 && (
        <div className="results-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <div className="rail-card" key={card}>
              <span className="skeleton skeleton-art" />
              <span className="skeleton skeleton-meta" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && validId && items.length === 0 && !error && (
        <div className="search-empty">
          <h2>Nothing here.</h2>
          <p>This collection has nothing in the catalogue yet.</p>
        </div>
      )}

      {hasMore && (
        <div className="browse-more">
          <button type="button" onClick={loadMore} disabled={isLoading}>
            {isLoading ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </section>
  );
}

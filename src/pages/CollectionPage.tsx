import { useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { LoadMore, ResultsGrid, ResultsSkeleton } from "../components/ResultsGrid";
import { TitleCard } from "../components/TitleCard";
import type { MediaTitle } from "../domain/catalog";
import { useCollectionPage } from "../hooks/useCollection";
import { Callout, EmptyState, Page, PageHeader } from "../ui";

export function CollectionPage({ onOpen }: { onOpen: (item: MediaTitle) => void }) {
  const params = useParams();
  const collectionId = Number(params.id);
  const validId = Number.isInteger(collectionId) && collectionId > 0 ? collectionId : null;
  const { items, hasMore, isLoading, error, loadMore } = useCollectionPage(validId);
  const name = items[0]?.collection?.name ?? "";

  return (
    <Page>
      <PageHeader
        heading={name || "Collection"}
        description={
          items.length > 0
            ? `${items.length}${hasMore ? "+" : ""} title${items.length === 1 ? "" : "s"} in the collection.`
            : "Every film in this collection, in one place."
        }
      />

      {(error || !validId) && <Callout>{error || "That collection does not exist."}</Callout>}

      {items.length > 0 && (
        <ErrorBoundary label="This collection">
          <ResultsGrid>
            {items.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      )}

      {isLoading && items.length === 0 && <ResultsSkeleton />}

      {!isLoading && validId && items.length === 0 && !error && (
        <EmptyState
          heading="Nothing here."
          description="This collection has nothing in the catalogue yet."
        />
      )}

      {hasMore && <LoadMore isLoading={isLoading} onClick={loadMore} />}
    </Page>
  );
}

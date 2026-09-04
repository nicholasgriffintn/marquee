import { useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { LoadMore, ResultsGrid, ResultsSkeleton } from "../components/ResultsGrid";
import { ReelCard } from "../components/revival/ReelCard";
import { RevivalGate } from "../components/revival/RevivalGate";
import { VaultIndex } from "../components/revival/VaultIndex";
import { hubTitle, isHubFamily } from "../domain/revival";
import { useHubs, useShelfPages } from "../hooks/useRevival";
import { useRevivalGate } from "../hooks/useRevivalGate";
import { ButtonLink, Callout, EmptyState, Page, PageHeader } from "../ui";

export function RevivalShelfPage({ isReady }: { isReady: boolean }) {
  const { family = "", slug = "" } = useParams();
  const gate = useRevivalGate();
  const known = isHubFamily(family);
  const isOpen = isReady && gate.accepted && known;
  const hubs = useHubs(isOpen);
  const shelf = useShelfPages(known ? `${family}:${slug}` : null, isOpen);
  const heading = known ? hubTitle(family, shelf.label ?? slug) : "No such shelf";
  const plural = shelf.total === 1 ? "print" : "prints";

  if (!gate.accepted) {
    return (
      <Page>
        <PageHeader
          heading="The revival house"
          description="The small screen at the back. When the building came down, the sign went in a skip and this did not."
        />
        <RevivalGate onAccept={gate.accept} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        heading={heading}
        description={
          known
            ? `${shelf.total ? `${shelf.total.toLocaleString()} ${plural}` : "Prints"} out of copyright and free to watch here, no account and no advert. Every one carries its provenance.`
            : "There is no shelf by that name. The vault is through the other door."
        }
      />

      {shelf.error && <Callout>{shelf.error}</Callout>}

      {shelf.works.length > 0 && (
        <ErrorBoundary label="This shelf">
          <ResultsGrid>
            {shelf.works.map((work) => (
              <ReelCard key={work.id} work={work} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      )}

      {shelf.isLoading && shelf.works.length === 0 && <ResultsSkeleton count={8} />}

      {!shelf.isLoading && shelf.works.length === 0 && !shelf.error && (
        <EmptyState
          heading="Nothing on this shelf."
          description="The projectionist may have moved it. Try the vault."
          actions={
            <ButtonLink to="/revival" variant="primary" size="lg">
              Back to the revival house
            </ButtonLink>
          }
        />
      )}

      {shelf.hasMore && <LoadMore isLoading={shelf.isLoading} onClick={shelf.loadMore} />}

      <VaultIndex hubs={hubs} current={known ? { family, slug } : undefined} />
    </Page>
  );
}

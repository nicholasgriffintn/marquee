import { useParams } from "react-router-dom";

import { AwardsNote } from "../components/AwardsNote";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { LoadMore, ResultsGrid, ResultsSkeleton } from "../components/ResultsGrid";
import { TitleCard } from "../components/TitleCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import { usePerson } from "../hooks/usePerson";
import { Button, Callout, EmptyState, Eyebrow, Heading, Page, Text } from "../ui";

import styles from "./PersonPage.module.css";

function shelfLine(shelved: number, watched: number) {
  if (shelved === 0) {
    return "Nothing of theirs on your shelf yet.";
  }

  return `${shelved} on your shelf${watched > 0 ? `, ${watched} of them seen` : ""}.`;
}

export function PersonPage({
  isSignedIn,
  onOpen,
}: {
  isSignedIn: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const params = useParams();
  const name = decodeURIComponent(params.name ?? "");
  const { data, following, error, saveError, isLoading, hasMore, loadMore, toggleFollow } =
    usePerson(name, isSignedIn);

  if (!data && (error || !isLoading)) {
    return (
      <Page>
        <div className={styles.head}>
          <UsherMark face="unimpressed" crop="head" className={styles.mark} />
          <div>
            <Eyebrow tone="accent" tracking="wide" className={styles.eyebrow}>
              On the credits
            </Eyebrow>
            <Heading level={1} size="heading" family="serif" className={styles.name}>
              {name}
            </Heading>
            <Text tone="muted" leading="relaxed" className={styles.lede}>
              {error || "Nobody here by that name."}
            </Text>
          </div>
        </div>
      </Page>
    );
  }

  const person = data?.person;

  return (
    <Page>
      <div className={styles.head}>
        <UsherMark face="thinking" crop="head" className={styles.mark} />
        <div>
          <Eyebrow tone="accent" tracking="wide" className={styles.eyebrow}>
            On the credits
          </Eyebrow>
          <Heading level={1} size="heading" family="serif" className={styles.name}>
            {person?.name ?? name}
          </Heading>
          <Text tone="muted" leading="relaxed" className={styles.lede}>
            {person
              ? `${person.titles} title${person.titles === 1 ? "" : "s"} in the catalogue. ${
                  isSignedIn ? shelfLine(data?.shelf.shelved ?? 0, data?.shelf.watched ?? 0) : ""
                }`
              : "Looking them up…"}
          </Text>
          {isSignedIn && person && (
            <Button
              variant={following ? "secondary" : "primary"}
              size="md"
              className={styles.follow}
              onClick={() => void toggleFollow()}
            >
              {following ? "Stop watching for them" : "Tell me when they turn up"}
            </Button>
          )}
          {saveError && <Callout>{saveError}</Callout>}
          {data && <AwardsNote awards={data.awards} />}
        </div>
      </div>

      {error && <Callout>{error}</Callout>}

      {data && data.items.length > 0 && (
        <ErrorBoundary label="This filmography">
          <ResultsGrid>
            {data.items.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      )}

      {isLoading && (!data || data.items.length === 0) && <ResultsSkeleton poster />}

      {!isLoading && data && data.items.length === 0 && !error && (
        <EmptyState heading="Nothing here." description="Nothing of theirs in the catalogue yet." />
      )}

      {hasMore && <LoadMore isLoading={isLoading} onClick={loadMore} />}
    </Page>
  );
}

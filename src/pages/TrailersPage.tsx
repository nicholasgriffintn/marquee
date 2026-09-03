import { useEffect, useRef, useState } from "react";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { TrailerReel } from "../components/trailers/TrailerReel";
import { TrailerScreen } from "../components/trailers/TrailerScreen";
import type { MediaTitle } from "../domain/catalog";
import type { ProfileEntryState } from "../domain/profile-entry";
import { TRAILER_SORT_LABELS, TRAILER_SORTS, type TrailerSort } from "../domain/trailers";
import { useTrailers } from "../hooks/useTrailers";
import { Callout, Chip, EmptyState, Page, PageHeader, Skeleton, VisuallyHidden } from "../ui";

import styles from "./TrailersPage.module.css";

const SKELETON_REEL = [0, 1, 2, 3, 4];

function TrailersSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton shape="art" className={styles.skeletonScreen} />
      <div className={styles.skeletonBill}>
        <Skeleton shape="heading" short />
        <Skeleton shape="meta" short />
      </div>
      <div className={styles.skeletonReel}>
        {SKELETON_REEL.map((item) => (
          <Skeleton shape="art" className={styles.skeletonItem} key={item} />
        ))}
      </div>
    </div>
  );
}

export function TrailersPage({
  isReady,
  isSignedIn,
  entryStates,
  onLoadEntry,
  onOpen,
  onSave,
}: {
  isReady: boolean;
  isSignedIn: boolean;
  entryStates: Record<string, ProfileEntryState>;
  onLoadEntry: (titleId: string) => Promise<void>;
  onOpen: (title: MediaTitle) => void;
  onSave: (title: MediaTitle) => void;
}) {
  const [sort, setSort] = useState<TrailerSort>("latest");
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const { trailers, error, isLoading } = useTrailers(sort, isReady);
  const current = trailers[Math.min(active, Math.max(0, trailers.length - 1))];
  const currentId = current?.item.id ?? "";
  const entryState = currentId ? entryStates[currentId] : undefined;
  const entryKnown = entryState?.status === "loaded" || entryState?.status === "loading";

  useEffect(() => {
    if (isSignedIn && currentId && !entryKnown) {
      void onLoadEntry(currentId);
    }
  }, [isSignedIn, currentId, entryKnown, onLoadEntry]);

  function changeSort(next: TrailerSort) {
    setSort(next);
    setActive(0);
    setPlaying(false);
  }

  function select(index: number) {
    if (index < 0 || index >= trailers.length) {
      return;
    }

    setActive(index);
    screenRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <Page labelledBy="trailers-heading">
      <PageHeader
        heading="New trailers"
        headingId="trailers-heading"
        description="Every trailer and teaser that has landed lately, on one screen. Open a title to shelve it, and the notebook will write when something you follow gets a new one."
        actions={
          <fieldset className={styles.sorts}>
            <legend className={styles.legend}>
              <VisuallyHidden>Order trailers</VisuallyHidden>
            </legend>
            {TRAILER_SORTS.map((option) => (
              <Chip
                key={option}
                selected={sort === option}
                pressed={sort === option}
                onClick={() => changeSort(option)}
              >
                {TRAILER_SORT_LABELS[option]}
              </Chip>
            ))}
          </fieldset>
        }
      />
      {error && <Callout tone="error">{error}</Callout>}
      {isLoading ? (
        <TrailersSkeleton />
      ) : !current ? (
        <EmptyState
          heading="Nothing new on the reel"
          description="The booth checks for fresh trailers every few hours. Come back after the next sweep."
        />
      ) : (
        <div className={styles.theatre}>
          <div ref={screenRef} className={styles.screenSlot}>
            <ErrorBoundary label="The trailer" resetKey={current.key}>
              <TrailerScreen
                trailer={current}
                position={active + 1}
                total={trailers.length}
                playing={playing}
                isSignedIn={isSignedIn}
                entryState={entryState}
                onPlay={() => setPlaying(true)}
                onStep={(direction) => select(active + direction)}
                onOpen={onOpen}
                onSave={onSave}
              />
            </ErrorBoundary>
          </div>
          <TrailerReel trailers={trailers} activeKey={current.key} onSelect={select} />
        </div>
      )}
    </Page>
  );
}

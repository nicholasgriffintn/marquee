import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ResultsGrid, ResultsSkeleton } from "../components/ResultsGrid";
import { TitleCard } from "../components/TitleCard";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import type { UsherMoment } from "../domain/usher";
import { ArrowIcon, Button, EmptyState, Page, PageHeader } from "../ui";

import styles from "./SearchPage.module.css";

export function SearchPage({
  query,
  items,
  error,
  isSearching,
  isRefining,
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
  isRefining: boolean;
  usherMoment: UsherMoment | null;
  onOpen: (item: MediaTitle) => void;
  onShowTonight: () => void;
  onUsherAction: (moment: UsherMoment, actionId: string) => void;
  onUsherDismiss: (scope: "once" | "kind") => void;
}) {
  const trimmed = query.trim();
  const isLookingForHim = /^(the\s+)?usher$/iu.test(trimmed);
  const pendingCount = items.filter((item) => item.pending).length;
  const showSkeleton = (isSearching || isRefining) && items.length === 0 && trimmed.length > 1;

  return (
    <Page>
      <PageHeader
        heading={trimmed ? `“${trimmed}”` : "Search"}
        description={
          error
            ? error
            : isSearching
              ? "Searching the catalogue…"
              : trimmed
                ? `${items.length} result${items.length === 1 ? "" : "s"}${
                    pendingCount ? ` · ${pendingCount} being fetched` : ""
                  }${isRefining ? " · reading a little wider…" : ""}`
                : "Type a film or show name to search."
        }
      />

      {isLookingForHim && (
        <Link className={styles.usher} to="/usher">
          <UsherMark face="pleased" crop="head" className={styles.usherMark} />
          <span className={styles.usherCopy}>
            <strong>The Usher</strong>
            <small>Thirty years on the door. Not in the catalogue, but he is here.</small>
          </span>
          <em className={styles.usherArrow} aria-hidden="true">
            <ArrowIcon />
          </em>
        </Link>
      )}

      {items.length > 0 && (
        <ErrorBoundary label="These results">
          <ResultsGrid>
            {items.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ResultsGrid>
        </ErrorBoundary>
      )}

      {showSkeleton && <ResultsSkeleton count={8} />}

      {!isSearching && !isRefining && trimmed.length > 1 && items.length === 0 && !error && (
        <EmptyState
          heading={`Nothing found for “${trimmed}”.`}
          description="Marquee searched its own catalogue and OMDb. Try a different spelling, or browse what’s on tonight."
          actions={
            <Button variant="primary" size="lg" onClick={onShowTonight}>
              Back to tonight
            </Button>
          }
        >
          {usherMoment && (
            <div className={styles.moment}>
              <UsherCard moment={usherMoment} onAction={onUsherAction} onDismiss={onUsherDismiss} />
            </div>
          )}
        </EmptyState>
      )}
    </Page>
  );
}

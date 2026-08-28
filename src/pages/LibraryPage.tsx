import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ClearFilters, Facet, FilterBar } from "../components/filters/FilterBar";
import { Poster } from "../components/Poster";
import { SearchField } from "../components/SearchField";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import { episodeLabel } from "../domain/seasons";
import { isShelfSort, type ShelfSort } from "../domain/shelf";
import type { UsherMoment } from "../domain/usher";
import { useShelf } from "../hooks/useShelf";
import { formatDate } from "../lib/dates";
import type { EntryStatus, ViewingEntry } from "../types";
import {
  ArrowIcon,
  Button,
  Callout,
  Chip,
  EmptyState,
  Heading,
  Page,
  PageHeader,
  StarIcon,
  StatusNote,
} from "../ui";

import styles from "./LibraryPage.module.css";

const SORTS: { value: ShelfSort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "rating", label: "Your rating" },
  { value: "status", label: "Status" },
  { value: "year", label: "Year" },
  { value: "genre", label: "Genre" },
];

const STATUS_LABELS: Record<EntryStatus, string> = {
  watchlist: "On my watchlist",
  watching: "Watching",
  watched: "Watched",
  dropped: "Dropped",
};

const STATUS_ORDER: EntryStatus[] = ["watching", "watchlist", "watched", "dropped"];

function sinceLabel(entry: ViewingEntry) {
  return formatDate(entry.updatedAt, { month: "long" }, "a while back");
}

function groupFor(sort: ShelfSort, item: MediaTitle, entry: ViewingEntry) {
  if (sort === "year") {
    return item.year ? String(item.year) : "Year unknown";
  }

  if (sort === "genre") {
    return item.genres[0] ?? "Uncategorised";
  }

  if (sort === "rating") {
    return entry.rating ? `${entry.rating}/5` : "Not rated yet";
  }

  if (sort === "status") {
    return STATUS_LABELS[entry.status];
  }

  return "";
}

function sortGroups(sort: ShelfSort, names: string[]) {
  if (sort === "year") {
    return names.toSorted((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  }

  if (sort === "rating") {
    return names.toSorted((left, right) => right.localeCompare(left));
  }

  if (sort === "status") {
    return names.toSorted(
      (left, right) =>
        STATUS_ORDER.indexOf(
          (Object.keys(STATUS_LABELS) as EntryStatus[]).find(
            (key) => STATUS_LABELS[key] === left,
          ) ?? "watchlist",
        ) -
        STATUS_ORDER.indexOf(
          (Object.keys(STATUS_LABELS) as EntryStatus[]).find(
            (key) => STATUS_LABELS[key] === right,
          ) ?? "watchlist",
        ),
    );
  }

  return names.toSorted((left, right) => left.localeCompare(right));
}

export function LibraryPage({
  isSignedIn,
  usherMoment,
  onClaim,
  onDiscard,
  onOpen,
  onShowTonight,
  onUsherRequest,
  onUsherAction,
  onUsherDismiss,
}: {
  isSignedIn: boolean;
  usherMoment: UsherMoment | null;
  onClaim: (entry: ViewingEntry) => Promise<boolean>;
  onDiscard: (titleId: string) => Promise<boolean>;
  onOpen: (item: MediaTitle) => void;
  onShowTonight: () => void;
  onUsherRequest: () => void;
  onUsherAction: (moment: UsherMoment, actionId: string) => void;
  onUsherDismiss: (scope: "once" | "kind") => void;
}) {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").trim();
  const statusFilter = params.get("status") ?? "";
  const genreFilter = params.get("genre") ?? "";
  const sortParam = params.get("sort");
  const sort: ShelfSort = isShelfSort(sortParam) ? sortParam : "added";
  const shelf = useShelf(isSignedIn, {
    sort,
    status: statusFilter,
    genre: genreFilter,
    query,
  });
  const savedCount = shelf.shelved;
  const lost = shelf.lost.map(({ entry, title }) => ({ entry, item: title }));
  const [pendingLost, setPendingLost] = useState<ReadonlySet<string>>(() => new Set());

  async function resolveLostItem(
    titleId: string,
    binned: boolean,
    resolve: () => Promise<boolean>,
  ) {
    setPendingLost((current) => new Set([...current, titleId]));

    const succeeded = await resolve();

    setPendingLost((current) => {
      const next = new Set(current);

      next.delete(titleId);

      return next;
    });

    if (succeeded) {
      shelf.note(titleId, binned);
    }
  }

  useEffect(() => {
    if (savedCount >= 5) {
      onUsherRequest();
    }
  }, [onUsherRequest, savedCount]);

  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params);

    for (const [name, value] of Object.entries(next)) {
      if (value) {
        merged.set(name, value);
      } else {
        merged.delete(name);
      }
    }

    setParams(merged, { replace: true });
  }

  const genres = shelf.genres;
  const visible = shelf.items.map(({ entry, title }) => ({
    entry,
    item: title,
  }));

  const grouped = new Map<string, typeof visible>();

  for (const shelfItem of visible) {
    const name = groupFor(sort, shelfItem.item, shelfItem.entry);

    grouped.set(name, [...(grouped.get(name) ?? []), shelfItem]);
  }

  const groupNames = sortGroups(sort, [...grouped.keys()]);
  const hasFilters = Boolean(query || statusFilter || genreFilter);

  return (
    <Page>
      <PageHeader
        heading="My shelf"
        description={
          savedCount
            ? `${shelf.matched.toLocaleString()} of ${savedCount.toLocaleString()} title${savedCount === 1 ? "" : "s"}. Click a poster to rate it or add notes.`
            : "Ratings and notes stay in your account and shape your recommendations."
        }
      />

      {usherMoment && (
        <UsherCard moment={usherMoment} onAction={onUsherAction} onDismiss={onUsherDismiss} />
      )}

      {lost.length > 0 && (
        <ErrorBoundary label="Lost property">
          <section className={styles.lost}>
            <div className={styles.lostHead}>
              <UsherMark face="unimpressed" crop="head" className={styles.lostMark} />
              <div>
                <span className={styles.lostLabel}>Lost property</span>
                <p className={styles.lostLine}>
                  {lost.length === 1 ? "This has" : `These ${lost.length} have`} been in the box
                  since {sinceLabel(lost[lost.length - 1].entry)}. Claim them or I am throwing them
                  out.
                </p>
              </div>
            </div>
            <ul className={styles.lostItems}>
              {lost.map(({ item, entry }) => (
                <li key={item.id}>
                  <button type="button" className={styles.lostPoster} onClick={() => onOpen(item)}>
                    <Poster item={item} />
                  </button>
                  <strong>{item.title}</strong>
                  <div className={styles.lostButtons}>
                    <button
                      type="button"
                      className={styles.lostClaim}
                      disabled={pendingLost.has(item.id)}
                      onClick={() => void resolveLostItem(item.id, false, () => onClaim(entry))}
                    >
                      Claim it
                    </button>
                    <button
                      type="button"
                      className={styles.lostBin}
                      disabled={pendingLost.has(item.id)}
                      onClick={() => void resolveLostItem(item.id, true, () => onDiscard(item.id))}
                    >
                      Bin it
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </ErrorBoundary>
      )}

      {shelf.error && <Callout>{shelf.error}</Callout>}

      {savedCount > 0 && (
        <FilterBar>
          <SearchField
            value={params.get("q") ?? ""}
            onChange={(value) => update({ q: value })}
            placeholder="Search your shelf"
            label="Search your shelf"
          />

          <Facet label="Group by">
            {SORTS.map((option) => (
              <Chip
                key={option.value}
                selected={sort === option.value}
                pressed={sort === option.value}
                onClick={() => update({ sort: option.value === "added" ? "" : option.value })}
              >
                {option.label}
              </Chip>
            ))}
          </Facet>

          <Facet label="Status">
            {STATUS_ORDER.map((status) => (
              <Chip
                key={status}
                selected={statusFilter === status}
                pressed={statusFilter === status}
                onClick={() => update({ status: statusFilter === status ? "" : status })}
              >
                {STATUS_LABELS[status]}
              </Chip>
            ))}
          </Facet>

          {genres.length > 1 && (
            <Facet label="Genre">
              {genres.map((genre) => (
                <Chip
                  key={genre}
                  selected={genreFilter === genre}
                  pressed={genreFilter === genre}
                  onClick={() => update({ genre: genreFilter === genre ? "" : genre })}
                >
                  {genre}
                </Chip>
              ))}
            </Facet>
          )}

          {hasFilters && <ClearFilters onClick={() => update({ q: "", status: "", genre: "" })} />}
        </FilterBar>
      )}

      {groupNames.map((name) => (
        <ErrorBoundary key={name || "all"} label="This shelf">
          <div className={styles.group}>
            {name && (
              <Heading level={2} size="subhead" className={styles.groupHeading}>
                {name} <em>{grouped.get(name)?.length}</em>
              </Heading>
            )}
            <div className={styles.grid}>
              {grouped.get(name)?.map(({ item, entry }) => (
                <button
                  type="button"
                  className={styles.item}
                  key={item.id}
                  onClick={() => onOpen(item)}
                  aria-label={`Open ${item.title}`}
                >
                  <Poster item={item} className={styles.itemPoster} />
                  <strong>{item.title}</strong>
                  <small className={styles.itemMeta}>
                    {STATUS_LABELS[entry.status]}
                    {entry.rating ? (
                      <span className={styles.itemRating} aria-label={`${entry.rating} out of 5`}>
                        <span aria-hidden="true">·</span>
                        {Array.from({ length: entry.rating }, (_, index) => index + 1).map(
                          (star) => (
                            <StarIcon key={star} />
                          ),
                        )}
                      </span>
                    ) : null}
                    {entry.season && entry.episode
                      ? ` · ${episodeLabel(entry.season, entry.episode)}`
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          </div>
        </ErrorBoundary>
      ))}

      {shelf.hasMore && (
        <div className={styles.more}>
          <Button
            variant="secondary"
            size="lg"
            disabled={shelf.isLoadingMore}
            onClick={() => void shelf.loadMore()}
          >
            {shelf.isLoadingMore
              ? "Fetching…"
              : `Show more · ${(shelf.matched - visible.length).toLocaleString()} to go`}
          </Button>
        </div>
      )}

      {savedCount > 0 && visible.length === 0 && !shelf.isLoading && (
        <EmptyState
          heading="Nothing on your shelf matches."
          description="Try clearing a filter or searching for something else."
        />
      )}

      {shelf.isLoading && (
        <StatusNote busy live="polite">
          Fetching your shelf…
        </StatusNote>
      )}

      {!savedCount && !shelf.isLoading && (
        <EmptyState
          heading="Nothing on your shelf yet."
          size="heading"
          description="Save something from Tonight to rate it and keep notes here."
          actions={
            <Button variant="primary" size="lg" onClick={onShowTonight}>
              Find something <ArrowIcon />
            </Button>
          }
        />
      )}
    </Page>
  );
}

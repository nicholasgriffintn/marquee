import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { ArrowIcon, Poster, SearchIcon, StarIcon } from "../components/ui";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import { episodeLabel } from "../domain/seasons";
import { isShelfSort, type ShelfSort } from "../domain/shelf";
import type { UsherMoment } from "../domain/usher";
import { useShelf } from "../hooks/useShelf";
import { formatDate } from "../lib/dates";
import type { EntryStatus, ViewingEntry } from "../types";

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
    return names.sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  }

  if (sort === "rating") {
    return names.sort((left, right) => right.localeCompare(left));
  }

  if (sort === "status") {
    return names.sort(
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

  return names.sort((left, right) => left.localeCompare(right));
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
    <section className="page-section library-page">
      <PageTitle heading="My shelf">
        <p>
          {savedCount
            ? `${shelf.matched.toLocaleString()} of ${savedCount.toLocaleString()} title${savedCount === 1 ? "" : "s"}. Click a poster to rate it or add notes.`
            : "Ratings and notes stay in your account and shape your recommendations."}
        </p>
      </PageTitle>

      {usherMoment && (
        <UsherCard moment={usherMoment} onAction={onUsherAction} onDismiss={onUsherDismiss} />
      )}

      {lost.length > 0 && (
        <ErrorBoundary label="Lost property">
          <section className="lost-property">
            <div className="lost-head">
              <UsherMark face="unimpressed" crop="head" />
              <div>
                <span>Lost property</span>
                <p>
                  {lost.length === 1 ? "This has" : `These ${lost.length} have`} been in the box
                  since {sinceLabel(lost[lost.length - 1].entry)}. Claim them or I am throwing them
                  out.
                </p>
              </div>
            </div>
            <ul className="lost-items">
              {lost.map(({ item, entry }) => (
                <li key={item.id}>
                  <button type="button" className="lost-poster" onClick={() => onOpen(item)}>
                    <Poster item={item} />
                  </button>
                  <strong>{item.title}</strong>
                  <div className="lost-buttons">
                    <button
                      type="button"
                      disabled={pendingLost.has(item.id)}
                      onClick={() => void resolveLostItem(item.id, false, () => onClaim(entry))}
                    >
                      Claim it
                    </button>
                    <button
                      type="button"
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

      {shelf.error && (
        <p className="catalogue-error" role="alert">
          {shelf.error}
        </p>
      )}

      {savedCount > 0 && (
        <div className="browse-filters">
          <label className="browse-search">
            <span aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              value={params.get("q") ?? ""}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="Search your shelf"
              aria-label="Search your shelf"
            />
          </label>

          <div className="browse-facet">
            <span>Group by</span>
            <div className="browse-chips">
              {SORTS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={sort === option.value ? "selected" : ""}
                  aria-pressed={sort === option.value}
                  onClick={() =>
                    update({
                      sort: option.value === "added" ? "" : option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="browse-facet">
            <span>Status</span>
            <div className="browse-chips">
              {STATUS_ORDER.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={statusFilter === status ? "selected" : ""}
                  aria-pressed={statusFilter === status}
                  onClick={() => update({ status: statusFilter === status ? "" : status })}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>

          {genres.length > 1 && (
            <div className="browse-facet">
              <span>Genre</span>
              <div className="browse-chips">
                {genres.map((genre) => (
                  <button
                    type="button"
                    key={genre}
                    className={genreFilter === genre ? "selected" : ""}
                    aria-pressed={genreFilter === genre}
                    onClick={() => update({ genre: genreFilter === genre ? "" : genre })}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasFilters && (
            <button
              type="button"
              className="browse-clear"
              onClick={() => update({ q: "", status: "", genre: "" })}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {groupNames.map((name) => (
        <ErrorBoundary key={name || "all"} label="This shelf">
          <div className="shelf-group">
            {name && (
              <h2>
                {name} <em>{grouped.get(name)?.length}</em>
              </h2>
            )}
            <div className="shelf-grid">
              {grouped.get(name)?.map(({ item, entry }) => (
                <button
                  type="button"
                  className="shelf-item"
                  key={item.id}
                  onClick={() => onOpen(item)}
                  aria-label={`Open ${item.title}`}
                >
                  <Poster item={item} />
                  <strong>{item.title}</strong>
                  <small className="shelf-item-meta">
                    {STATUS_LABELS[entry.status]}
                    {entry.rating ? (
                      <span className="shelf-item-rating" aria-label={`${entry.rating} out of 5`}>
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
        <div className="shelf-more">
          <button
            type="button"
            onClick={() => void shelf.loadMore()}
            disabled={shelf.isLoadingMore}
          >
            {shelf.isLoadingMore
              ? "Fetching…"
              : `Show more · ${(shelf.matched - visible.length).toLocaleString()} to go`}
          </button>
        </div>
      )}

      {savedCount > 0 && visible.length === 0 && !shelf.isLoading && (
        <div className="search-empty">
          <h2>Nothing on your shelf matches.</h2>
          <p>Try clearing a filter or searching for something else.</p>
        </div>
      )}

      {!savedCount && (
        <div className="empty-library">
          <strong>Nothing on your shelf yet.</strong>
          <p>Save something from Tonight to rate it and keep notes here.</p>
          <button type="button" onClick={onShowTonight}>
            Find something <ArrowIcon />
          </button>
        </div>
      )}
    </section>
  );
}

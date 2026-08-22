import { useSearchParams } from "react-router-dom";

import { ArrowIcon, Poster } from "../components/ui";
import type { MediaTitle } from "../domain/catalog";
import type { EntryStatus, ViewingEntry } from "../types";

type ShelfSort = "added" | "year" | "genre" | "rating" | "status";

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

function groupFor(sort: ShelfSort, item: MediaTitle, entry: ViewingEntry) {
  if (sort === "year") {
    return item.year ? String(item.year) : "Year unknown";
  }

  if (sort === "genre") {
    return item.genres[0] ?? "Uncategorised";
  }

  if (sort === "rating") {
    return entry.rating ? `${"★".repeat(entry.rating)} ${entry.rating}/5` : "Not rated yet";
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
  entries,
  titles,
  catalogueError,
  onOpen,
  onShowTonight,
}: {
  entries: Record<string, ViewingEntry>;
  titles: MediaTitle[];
  catalogueError: string;
  onOpen: (item: MediaTitle) => void;
  onShowTonight: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const savedCount = Object.keys(entries).length;
  const query = (params.get("q") ?? "").trim().toLowerCase();
  const statusFilter = params.get("status") ?? "";
  const genreFilter = params.get("genre") ?? "";
  const sortParam = params.get("sort");
  const sort: ShelfSort = SORTS.some((option) => option.value === sortParam)
    ? (sortParam as ShelfSort)
    : "added";

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

  const shelved = titles.flatMap((item) => {
    const entry = entries[item.id];

    return entry ? [{ item, entry }] : [];
  });
  const genres = [...new Set(shelved.flatMap(({ item }) => item.genres))].sort();
  const visible = shelved.filter(
    ({ item, entry }) =>
      (!query || item.title.toLowerCase().includes(query)) &&
      (!statusFilter || entry.status === statusFilter) &&
      (!genreFilter || item.genres.includes(genreFilter)),
  );

  if (sort === "rating") {
    visible.sort((left, right) => (right.entry.rating ?? 0) - (left.entry.rating ?? 0));
  } else if (sort === "year") {
    visible.sort((left, right) => (right.item.year ?? 0) - (left.item.year ?? 0));
  } else if (sort === "genre" || sort === "status") {
    visible.sort((left, right) => left.item.title.localeCompare(right.item.title));
  }

  const grouped = new Map<string, typeof visible>();

  for (const shelfItem of visible) {
    const name = groupFor(sort, shelfItem.item, shelfItem.entry);

    grouped.set(name, [...(grouped.get(name) ?? []), shelfItem]);
  }

  const groupNames = sortGroups(sort, [...grouped.keys()]);
  const hasFilters = Boolean(query || statusFilter || genreFilter);

  return (
    <section className="page-section library-page">
      <div className="page-title-row">
        <div>
          <h1>My shelf</h1>
        </div>
        <p>
          {savedCount
            ? `${visible.length} of ${savedCount} title${savedCount === 1 ? "" : "s"}. Click a poster to rate it or add notes.`
            : "Ratings and notes stay in your account and shape your recommendations."}
        </p>
      </div>

      {catalogueError && savedCount > 0 && !titles.length && (
        <p className="catalogue-error" role="alert">
          We couldn’t load your saved titles. Try again in a moment.
        </p>
      )}

      {savedCount > 0 && (
        <div className="browse-filters">
          <label className="browse-search">
            <span>⌕</span>
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
                  onClick={() => update({ sort: option.value === "added" ? "" : option.value })}
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
        <div className="shelf-group" key={name || "all"}>
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
                <small>
                  {STATUS_LABELS[entry.status]}
                  {entry.rating ? ` · ${"★".repeat(entry.rating)}` : ""}
                </small>
              </button>
            ))}
          </div>
        </div>
      ))}

      {savedCount > 0 && visible.length === 0 && (
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

import { Link, useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { LoadMore } from "../components/ResultsGrid";
import { SearchField } from "../components/SearchField";
import { collectionPath, personPath } from "../domain/catalog";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  useCollectionsDirectory,
  usePeopleDirectory,
} from "../hooks/useDirectory";
import {
  Callout,
  EmptyState,
  Page,
  PageHeader,
  Skeleton,
  TabList,
  TabPanel,
} from "../ui";

import styles from "./DirectoryPage.module.css";

const SEARCH_DELAY_MS = 250;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

const TABS = [
  { id: "people", label: "People" },
  { id: "collections", label: "Collections" },
];

function titleCount(titles: number) {
  return `${titles.toLocaleString()} title${titles === 1 ? "" : "s"}`;
}

function DirectoryList({
  entries,
  isLoading,
  error,
  emptyDescription,
}: {
  entries: { key: string; name: string; titles: number; to: string }[];
  isLoading: boolean;
  error: string;
  emptyDescription: string;
}) {
  return (
    <>
      {error && <Callout>{error}</Callout>}

      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.key}>
              <Link to={entry.to} className={styles.entry}>
                <span className={styles.name}>{entry.name}</span>
                <small className={styles.count}>
                  {titleCount(entry.titles)}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isLoading && entries.length === 0 && (
        <div className={styles.list} aria-hidden="true">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className={styles.rowSkeleton} />
          ))}
        </div>
      )}

      {!isLoading && entries.length === 0 && !error && (
        <EmptyState
          heading="Nothing under that."
          description={emptyDescription}
        />
      )}
    </>
  );
}

export function DirectoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "collections" ? "collections" : "people";
  const query = params.get("q") ?? "";
  const debouncedQuery = useDebouncedValue(query, SEARCH_DELAY_MS);
  const people = usePeopleDirectory(debouncedQuery, tab === "people");
  const collections = useCollectionsDirectory(
    debouncedQuery,
    tab === "collections",
  );

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

  return (
    <Page>
      <PageHeader
        eyebrow="The index"
        heading="Everyone, and every set"
        description="Every name on the credits and every collection in the building, in one list. Pick one and I will show you what we hold."
      />

      <TabList
        label="Index"
        tabs={TABS}
        selected={tab}
        idPrefix="directory"
        onSelect={(id) => update({ tab: id === "people" ? "" : id })}
        className={styles.tabs}
      />

      <SearchField
        value={query}
        onChange={(value) => update({ q: value })}
        placeholder={tab === "people" ? "Search names" : "Search collections"}
        label={tab === "people" ? "Search names" : "Search collections"}
        className={styles.search}
      />

      <ErrorBoundary label="This index" resetKey={tab}>
        <TabPanel id="people" idPrefix="directory" hidden={tab !== "people"}>
          {tab === "people" && (
            <DirectoryList
              entries={people.items.map((person) => ({
                key: String(person.personId),
                name: person.name,
                titles: person.titles,
                to: personPath(person.personId),
              }))}
              isLoading={people.isLoading}
              error={people.error}
              emptyDescription="No one on the credits by that name."
            />
          )}

          {people.hasMore && (
            <LoadMore isLoading={people.isLoading} onClick={people.loadMore} />
          )}
        </TabPanel>

        <TabPanel
          id="collections"
          idPrefix="directory"
          hidden={tab !== "collections"}
        >
          {tab === "collections" && (
            <DirectoryList
              entries={collections.items.map((collection) => ({
                key: String(collection.id),
                name: collection.name,
                titles: collection.titles,
                to: collectionPath(collection.id),
              }))}
              isLoading={collections.isLoading}
              error={collections.error}
              emptyDescription="No collection goes by that name."
            />
          )}

          {collections.hasMore && (
            <LoadMore
              isLoading={collections.isLoading}
              onClick={collections.loadMore}
            />
          )}
        </TabPanel>
      </ErrorBoundary>
    </Page>
  );
}

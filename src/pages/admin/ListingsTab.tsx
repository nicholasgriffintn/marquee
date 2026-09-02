import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminListings, AdminOverview } from "../../hooks/useAdmin";
import { useResource } from "../../hooks/useResource";
import { Callout, Panel, TabPanel } from "../../ui";

import styles from "./admin.module.css";

function cinemaTotals(rows: { cinemas: number; located: number; screenings: number }[]) {
  const cinemas = rows.reduce((total, row) => total + row.cinemas, 0);
  const located = rows.reduce((total, row) => total + row.located, 0);
  const screenings = rows.reduce((total, row) => total + row.screenings, 0);

  return `${cinemas.toLocaleString()} cinemas across ${rows.length.toLocaleString()} chains, ${located.toLocaleString()} of them placed on a map, ${screenings.toLocaleString()} screenings ahead.`;
}

export function ListingsTab({
  overview,
  revision,
}: {
  overview: AdminOverview | null;
  revision: number;
}) {
  const { data: listings, error } = useResource<AdminListings>("/api/admin/listings", {
    errorMessage: "Could not read the listings.",
    refreshKey: String(revision),
  });

  return (
    <ErrorBoundary label="The listings">
      <TabPanel id="listings" idPrefix="admin">
        {error && <Callout>{error}</Callout>}
        {listings && listings.sections.length > 0 && (
          <Panel heading="Homepage rails" rule="none">
            <ul className={styles.list}>
              {listings.sections.map((section) => (
                <li key={section.id}>
                  <strong>{section.title}</strong>
                  <small>{section.titles} titles</small>
                  <span className={styles.spacer} />
                  <code>{section.id}</code>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {listings && (
          <Panel heading="Cinema listings">
            <p className={styles.note}>
              {cinemaTotals(listings.cinemas)} A cinema without coordinates never shows up in a
              nearby search, and listings are only pulled for the{" "}
              {(overview?.catalogue.interestCells ?? 0).toLocaleString()} places a member has looked
              from in the last thirty days — with none of those, Pull local listings has nothing to
              queue.
            </p>
            {listings.cinemas.length > 0 ? (
              <ul className={styles.list}>
                {listings.cinemas.map((row) => (
                  <li key={row.source}>
                    <strong>{row.source}</strong>
                    <small>
                      {row.located.toLocaleString()} of {row.cinemas.toLocaleString()} placed
                    </small>
                    {row.cinemas > row.located && (
                      <code>{(row.cinemas - row.located).toLocaleString()} unplaced</code>
                    )}
                    <small>
                      {row.matched.toLocaleString()} / {row.films.toLocaleString()} films matched
                    </small>
                    <span className={styles.spacer} />
                    <small>{row.screenings.toLocaleString()} ahead</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.note}>
                No directory yet. Run Refresh cinema directory to pull the chains.
              </p>
            )}
          </Panel>
        )}
      </TabPanel>
    </ErrorBoundary>
  );
}

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminListings, AdminOverview } from "../../hooks/useAdmin";
import { useResource } from "../../hooks/useResource";

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
      <div role="tabpanel" id="admin-panel-listings" aria-labelledby="admin-tab-listings">
        {error && (
          <p className="catalogue-error" role="alert">
            {error}
          </p>
        )}
        {listings && listings.sections.length > 0 && (
          <section className="panel-block" aria-labelledby="admin-sections-title">
            <h2 id="admin-sections-title">Homepage rails</h2>
            <ul className="admin-list">
              {listings.sections.map((section) => (
                <li key={section.id}>
                  <strong>{section.title}</strong>
                  <small>{section.titles} titles</small>
                  <span className="spacer" />
                  <code>{section.id}</code>
                </li>
              ))}
            </ul>
          </section>
        )}
        {listings && (
          <section className="panel-block" aria-labelledby="admin-cinemas-title">
            <h2 id="admin-cinemas-title">Cinema listings</h2>
            <p className="admin-note">
              {cinemaTotals(listings.cinemas)} A cinema without coordinates never shows up in a
              nearby search, and listings are only pulled for the{" "}
              {(overview?.catalogue.interestCells ?? 0).toLocaleString()} places a member has looked
              from in the last thirty days — with none of those, Pull local listings has nothing to
              queue.
            </p>
            {listings.cinemas.length > 0 ? (
              <ul className="admin-list">
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
                    <span className="spacer" />
                    <small>{row.screenings.toLocaleString()} ahead</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-note">
                No directory yet. Run Refresh cinema directory to pull the chains.
              </p>
            )}
          </section>
        )}
      </div>
    </ErrorBoundary>
  );
}

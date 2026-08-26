import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { ProjectionNote } from "../components/revival/ProjectionNote";
import { ReelCard } from "../components/revival/ReelCard";
import { SearchField } from "../components/ui";
import { UsherMark } from "../components/usher/UsherMark";
import { revivalPath, workMeta, type RevivalBillSlot, type RevivalShelf } from "../domain/revival";
import { useNearViewport } from "../hooks/useNearViewport";
import { useProgramme, useVaultSearch } from "../hooks/useRevival";

function Shelf({ shelf }: { shelf: RevivalShelf }) {
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref);

  if (shelf.works.length === 0) {
    return null;
  }

  return (
    <section className="content-rail" ref={ref}>
      <div className="rail-heading">
        <div>
          <span>{shelf.description}</span>
          <h2>{shelf.title}</h2>
        </div>
      </div>
      <div className="rail-track">
        {near
          ? shelf.works.map((work) => <ReelCard key={`${shelf.id}-${work.id}`} work={work} />)
          : shelf.works
              .slice(0, 4)
              .map((work) => <span key={work.id} className="skeleton skeleton-reel" />)}
      </div>
    </section>
  );
}

function Bill({ bill }: { bill: RevivalBillSlot[] }) {
  if (bill.length === 0) {
    return null;
  }

  return (
    <section className="revival-bill" aria-labelledby="revival-bill-title">
      <div className="rail-heading">
        <div>
          <span>Programmed for today, and different tomorrow.</span>
          <h2 id="revival-bill-title">Tonight&rsquo;s bill</h2>
        </div>
      </div>
      <ol className="revival-bill-list">
        {bill.map((entry, index) => (
          <li key={entry.work.id}>
            <Link to={revivalPath(entry.work)}>
              <span className="revival-bill-slot">{entry.slot}</span>
              <strong>{entry.work.title}</strong>
              <small>{workMeta(entry.work) || entry.note}</small>
            </Link>
            {index === 0 && <span className="revival-bill-rule" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RevivalPage({ isReady }: { isReady: boolean }) {
  const { programme, isLoading, error } = useProgramme(isReady);
  const [query, setQuery] = useState("");
  const search = useVaultSearch(query);

  return (
    <section className="page-section revival-shelves">
      <PageTitle heading="The revival house">
        <p>
          The small screen at the back. When the building came down, the sign went in a skip and
          this did not. The prints are out of copyright, the projectionist is somewhere behind that
          door, and the ticket is nothing.{" "}
          {programme.total ? `${programme.total.toLocaleString()} in the vault.` : ""}
        </p>
      </PageTitle>

      {error && (
        <p className="auth-message" role="alert">
          {error}
        </p>
      )}

      <div className="revival-search">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search the vault"
          label="Search the vault"
        />
        {search.isActive && (
          <span>
            {search.isSearching
              ? "Looking…"
              : `${search.works.length.toLocaleString()} of ${programme.total.toLocaleString()} in the vault`}
          </span>
        )}
      </div>

      {search.isActive && (
        <section className="content-rail" aria-busy={search.isSearching}>
          <div className="rail-heading">
            <div>
              <span>
                {search.isSearching ? "Going through the shelves." : "What the vault turned up."}
              </span>
              <h2>Search results</h2>
            </div>
          </div>
          {search.isSearching ? (
            <div className="rail-track">
              <span className="skeleton skeleton-reel" />
              <span className="skeleton skeleton-reel" />
              <span className="skeleton skeleton-reel" />
              <span className="skeleton skeleton-reel" />
            </div>
          ) : search.works.length ? (
            <div className="rail-track">
              {search.works.map((work) => (
                <ReelCard key={`search-${work.id}`} work={work} />
              ))}
            </div>
          ) : (
            <p className="rail-empty">Nothing under that name.</p>
          )}
        </section>
      )}

      {isLoading && !programme.shelves.length && (
        <div className="content-rail">
          <div className="rail-track">
            <span className="skeleton skeleton-reel" />
            <span className="skeleton skeleton-reel" />
            <span className="skeleton skeleton-reel" />
          </div>
        </div>
      )}

      {!isLoading && !programme.shelves.length && (
        <div className="search-empty">
          <UsherMark face="dormant" crop="head" />
          <h2>Nothing threaded yet.</h2>
          <p>
            The projectionist is still going through the vault. Come back when he has found
            something worth showing.
          </p>
          <Link className="button-link" to="/">
            Back to tonight
          </Link>
        </div>
      )}

      {!search.isActive && <Bill bill={programme.bill} />}

      {!search.isActive &&
        programme.shelves.map((shelf) => (
          <ErrorBoundary key={shelf.id} label="This shelf">
            <Shelf shelf={shelf} />
          </ErrorBoundary>
        ))}

      {programme.shelves.length > 0 && <ProjectionNote seed={programme.total} />}

      {programme.shelves.length > 0 && (
        <div className="revival-note">
          <p className="revival-note-head">On what we are allowed to show you</p>
          <p>
            Every print here was published as public domain by the archive holding it. That is their
            claim, and we pass it on. Whether we thread it up ourselves depends on one thing: UK
            copyright runs for seventy years after the last of the principal director, the
            screenwriters and the composer has died. Past that, the print is ours to keep and we
            serve it from our own vault.
          </p>
          <p>
            Not past it, and we do not touch the reel. The play button sends you to the archive that
            holds it and they show it to you, exactly as they would if you had walked in there
            yourself. Every print says which of the two it is, and why, on its own page. I would
            rather tell you where a thing came from than have you wonder.
          </p>
          <p>
            If you think something here is on the wrong shelf, say so. It comes down the same day,
            and we argue about it afterwards.
          </p>
        </div>
      )}
    </section>
  );
}

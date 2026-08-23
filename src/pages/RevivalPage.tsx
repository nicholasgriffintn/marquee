import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ReelCard } from "../components/revival/ReelCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { RevivalShelf } from "../domain/revival";
import { useProgramme } from "../hooks/useRevival";

function Shelf({ shelf }: { shelf: RevivalShelf }) {
  if (shelf.works.length === 0) {
    return null;
  }

  return (
    <section className="content-rail">
      <div className="rail-heading">
        <div>
          <span>{shelf.description}</span>
          <h2>{shelf.title}</h2>
        </div>
      </div>
      <div className="rail-track">
        {shelf.works.map((work) => (
          <ReelCard key={`${shelf.id}-${work.id}`} work={work} />
        ))}
      </div>
    </section>
  );
}

export function RevivalPage({ isReady }: { isReady: boolean }) {
  const { programme, isLoading, error } = useProgramme(isReady);

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <h1>The revival house</h1>
        </div>
        <p>
          The small screen at the back, where the prints are out of copyright and the ticket is
          nothing. {programme.total ? `${programme.total} in the vault.` : ""}
        </p>
      </div>

      {error && (
        <p className="auth-message" role="alert">
          {error}
        </p>
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

      {programme.shelves.map((shelf) => (
        <ErrorBoundary key={shelf.id} label="This shelf">
          <Shelf shelf={shelf} />
        </ErrorBoundary>
      ))}

      {programme.shelves.length > 0 && (
        <p className="revival-note">
          Everything here is in the public domain in the United States, either because the copyright
          term has run out or because the rights were never asserted. Prints come from the Internet
          Archive and the Library of Congress; where we hold our own copy it says so on the card. If
          you believe something on this shelf is still in copyright, tell us and it comes off.
        </p>
      )}
    </section>
  );
}

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
    <section className="page-section revival-shelves">
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
          Everything here has been published as public domain by the archive that holds it. Where a
          print is also out of copyright under UK law — 70 years from the death of the last of its
          principal director, screenwriters and composer — we keep our own copy and serve it
          ourselves. Where it is free where it was published but the UK term has not run out, we do
          not re-host it: the play button goes to the archive that holds it, and they serve it, as
          they would if you went there yourself. Each print says which of the two it is, and why, on
          its own page. If you believe something here is wrongly listed, tell us and it comes off.
        </p>
      )}
    </section>
  );
}

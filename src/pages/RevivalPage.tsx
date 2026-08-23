import { Link } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { ProjectionNote } from "../components/revival/ProjectionNote";
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
      <PageTitle heading="The revival house">
        <p>
          The small screen at the back. When the building came down, the sign went in a skip and
          this did not. The prints are out of copyright, the projectionist is somewhere behind that
          door, and the ticket is nothing.{" "}
          {programme.total ? `${programme.total} in the vault.` : ""}
        </p>
      </PageTitle>

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

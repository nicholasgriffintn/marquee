import { Link, useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { ReelCard } from "../components/revival/ReelCard";
import { ReelPlayer } from "../components/revival/ReelPlayer";
import { UsherMark } from "../components/usher/UsherMark";
import { RIGHTS_LABELS, SOURCE_LABELS, workMeta } from "../domain/revival";
import { useScreening } from "../hooks/useRevival";

export function RevivalScreenPage({ isSignedIn }: { isSignedIn: boolean }) {
  const { workId } = useParams();
  const { screening, isLoading, error } = useScreening(workId);

  if (isLoading) {
    return (
      <section className="page-section">
        <div className="reel-frame skeleton" />
      </section>
    );
  }

  if (!screening) {
    return (
      <section className="page-section">
        <div className="search-empty lost">
          <UsherMark face="unimpressed" crop="head" />
          <h2>Nothing showing under that name.</h2>
          <p>{error || "That print is not on our shelves."}</p>
          <Link className="button-link" to="/revival">
            Back to the revival house
          </Link>
        </div>
      </section>
    );
  }

  const { work } = screening;

  return (
    <section className="page-section revival-screen">
      <div className="page-title-row">
        <div>
          <h1>{work.title}</h1>
        </div>
        <p>{workMeta(work) || "Public domain"}</p>
      </div>

      <ErrorBoundary label="The projector" resetKey={work.id}>
        <ReelPlayer
          key={work.id}
          work={work}
          startAt={screening.positionSeconds}
          canSave={isSignedIn}
        />
      </ErrorBoundary>

      {work.synopsis && <p className="detail-synopsis">{work.synopsis}</p>}

      <dl className="revival-provenance">
        <div>
          <dt>Why it is free</dt>
          <dd>
            {RIGHTS_LABELS[work.rightsBasis]}
            {work.rightsNote ? ` · ${work.rightsNote}` : ""}
          </dd>
        </div>
        <div>
          <dt>Print held by</dt>
          <dd>
            {work.mirrored
              ? `Marquee, copied from ${SOURCE_LABELS[work.source]}`
              : `${SOURCE_LABELS[work.source]}, streamed through us`}
          </dd>
        </div>
        <div>
          <dt>Source record</dt>
          <dd>
            <a href={work.sourceUrl} target="_blank" rel="noreferrer">
              {SOURCE_LABELS[work.source]} ↗
            </a>
          </dd>
        </div>
        {work.titleId && (
          <div>
            <dt>In the catalogue</dt>
            <dd>
              <Link to={`/${work.titleId.replace(":", "/")}`}>Open the title card</Link>
            </dd>
          </div>
        )}
      </dl>

      {screening.alsoShowing.length > 0 && (
        <section className="content-rail">
          <div className="rail-heading">
            <div>
              <span>Still running down here.</span>
              <h2>Also showing</h2>
            </div>
          </div>
          <div className="rail-track">
            {screening.alsoShowing.map((other) => (
              <ReelCard key={other.id} work={other} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

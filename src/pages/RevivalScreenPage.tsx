import { Link, useParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { ReelCard } from "../components/revival/ReelCard";
import { ReelPlayer } from "../components/revival/ReelPlayer";
import { ExternalLinkIcon } from "../components/ui";
import { UsherMark } from "../components/usher/UsherMark";
import {
  CONDITION_LABELS,
  CONDITION_NOTES,
  deliveryNote,
  printMeta,
  revivalPath,
  rightsSummary,
  SOURCE_LABELS,
  ukStanding,
  workMeta,
} from "../domain/revival";
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
    <section className="page-section revival-screen revival-shelves">
      <PageTitle heading={work.title}>
        <p>{workMeta(work) || "Public domain in the UK"}</p>
      </PageTitle>

      {work.contentNotice && (
        <aside className="content-notice" role="note">
          <strong>Before you start</strong>
          <p>{work.contentNotice}</p>
        </aside>
      )}

      <ErrorBoundary label="The projector" resetKey={work.id}>
        <ReelPlayer
          key={work.id}
          work={work}
          startAt={screening.positionSeconds}
          canSave={isSignedIn}
        />
      </ErrorBoundary>

      <p className="print-condition" data-condition={work.condition}>
        <span>{CONDITION_LABELS[work.condition]}</span>
        <em>{CONDITION_NOTES[work.condition]}</em>
      </p>

      {work.synopsis && <p className="detail-synopsis">{work.synopsis}</p>}

      {work.tags.length > 0 && (
        <div className="revival-tags">
          {work.tags
            .filter((tag) => tag.kind !== "language")
            .map((tag) => (
              <span key={`${tag.kind}-${tag.slug}`} className={`revival-tag tag-${tag.kind}`}>
                {tag.label}
              </span>
            ))}
        </div>
      )}

      <dl className="revival-provenance">
        <div>
          <dt>Rights note</dt>
          <dd>
            {rightsSummary(work)}
            {work.rightsNote ? ` · ${work.rightsNote}` : ""}
          </dd>
        </div>
        <div>
          <dt>UK standing</dt>
          <dd>{ukStanding(work)}</dd>
        </div>
        <div>
          <dt>Hosted by</dt>
          <dd>{deliveryNote(work)}</dd>
        </div>
        <div>
          <dt>Source record</dt>
          <dd>
            <a href={work.sourceUrl} target="_blank" rel="noreferrer">
              {SOURCE_LABELS[work.source]} <ExternalLinkIcon />
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

      {screening.prints.length > 0 && (
        <section className="revival-prints" aria-labelledby="revival-prints-title">
          <div className="rail-heading">
            <div>
              <span>{screening.prints.length + 1} copies of this survive in the archives.</span>
              <h2 id="revival-prints-title">Other prints</h2>
            </div>
          </div>
          <ul className="revival-print-list">
            {screening.prints.map((print) => (
              <li key={print.id}>
                <Link to={revivalPath(print)}>
                  <strong>{print.title}</strong>
                  <small>{printMeta(print)}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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

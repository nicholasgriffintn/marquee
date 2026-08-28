import { useParams } from "react-router-dom";

import { AwardsNote } from "../components/AwardsNote";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { TitleCard } from "../components/TitleCard";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import { usePerson } from "../hooks/usePerson";

function shelfLine(shelved: number, watched: number) {
  if (shelved === 0) {
    return "Nothing of theirs on your shelf yet.";
  }

  return `${shelved} on your shelf${watched > 0 ? `, ${watched} of them seen` : ""}.`;
}

export function PersonPage({
  isSignedIn,
  onOpen,
}: {
  isSignedIn: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const params = useParams();
  const name = decodeURIComponent(params.name ?? "");
  const { data, following, error, saveError, isLoading, hasMore, loadMore, toggleFollow } =
    usePerson(name, isSignedIn);

  if (!data && (error || !isLoading)) {
    return (
      <section className="page-section">
        <div className="notebook-head">
          <UsherMark face="unimpressed" crop="head" className="notebook-mark" />
          <div>
            <p className="page-eyebrow">On the credits</p>
            <h1>{name}</h1>
            <p className="notebook-lede">{error || "Nobody here by that name."}</p>
          </div>
        </div>
      </section>
    );
  }

  const person = data?.person;

  return (
    <section className="page-section">
      <div className="notebook-head">
        <UsherMark face="thinking" crop="head" className="notebook-mark" />
        <div>
          <p className="page-eyebrow">On the credits</p>
          <h1>{person?.name ?? name}</h1>
          <p className="notebook-lede">
            {person
              ? `${person.titles} title${person.titles === 1 ? "" : "s"} in the catalogue. ${
                  isSignedIn ? shelfLine(data?.shelf.shelved ?? 0, data?.shelf.watched ?? 0) : ""
                }`
              : "Looking them up…"}
          </p>
          {isSignedIn && person && (
            <button
              type="button"
              className={following ? "link-button" : "link-button link-button-primary"}
              onClick={() => void toggleFollow()}
            >
              {following ? "Stop watching for them" : "Tell me when they turn up"}
            </button>
          )}
          {saveError && (
            <p className="catalogue-error" role="alert">
              {saveError}
            </p>
          )}
          {data && <AwardsNote awards={data.awards} />}
        </div>
      </div>

      {error && (
        <p className="auth-message" role="alert">
          {error}
        </p>
      )}

      {data && data.items.length > 0 && (
        <ErrorBoundary label="This filmography">
          <div className="results-grid">
            {data.items.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </ErrorBoundary>
      )}

      {isLoading && (!data || data.items.length === 0) && (
        <div className="results-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <div className="rail-card" key={card}>
              <span className="skeleton skeleton-poster" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data && data.items.length === 0 && !error && (
        <div className="search-empty">
          <h2>Nothing here.</h2>
          <p>Nothing of theirs in the catalogue yet.</p>
        </div>
      )}

      {hasMore && (
        <div className="browse-more">
          <button type="button" onClick={loadMore} disabled={isLoading}>
            {isLoading ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </section>
  );
}

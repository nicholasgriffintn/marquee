import { TitleCard } from "../components/catalog";
import type { MediaTitle } from "../domain/catalog";
import { useDigest } from "../hooks/useDigest";

function formatWhen(value: string) {
  const airsAt = new Date(value);

  if (Number.isNaN(airsAt.getTime())) {
    return "";
  }

  return airsAt.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DigestPage({
  isSignedIn,
  onOpen,
}: {
  isSignedIn: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const { digest, isLoading } = useDigest(isSignedIn);

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <h1>
            This week, <em>picked for your shelf.</em>
          </h1>
        </div>
        <p>
          Rebuilt every Monday from what you save and rate, what is airing, and what people are
          reading about.
          {digest ? ` Last built ${new Date(digest.createdAt).toLocaleDateString()}.` : ""}
        </p>
      </div>

      {!isSignedIn && <p className="catalogue-error">Sign in to get a weekly digest.</p>}

      {isSignedIn && isLoading && <p className="rails-building">Reading your digest…</p>}

      {isSignedIn && !isLoading && !digest && (
        <div className="honest-empty">
          <h2>Nothing yet.</h2>
          <p>Save a few titles to your shelf. The first digest is built on the next Monday run.</p>
        </div>
      )}

      {digest?.fresh.length ? (
        <>
          <h2 className="digest-heading">New, and close to your taste</h2>
          <div className="results-grid">
            {digest.fresh.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}

      {digest?.episodes.length ? (
        <>
          <h2 className="digest-heading">Airing this week</h2>
          <ul className="digest-episodes">
            {digest.episodes.map((episode) => (
              <li key={`${episode.showName}-${episode.airsAt}`}>
                <time dateTime={episode.airsAt}>{formatWhen(episode.airsAt)}</time>
                <strong>{episode.showName}</strong>
                <small>
                  {episode.season && episode.episode
                    ? `S${episode.season}E${episode.episode}`
                    : "New episode"}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {digest?.trending.length ? (
        <>
          <h2 className="digest-heading">People are reading about these</h2>
          <div className="results-grid">
            {digest.trending.map((item) => (
              <TitleCard key={item.id} item={item} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

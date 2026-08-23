import { ArtPlaceholder } from "../components/ArtPlaceholder";
import { TitleCard } from "../components/catalog";
import { UsherMark } from "../components/usher/UsherMark";
import type { MediaTitle } from "../domain/catalog";
import { useDigest } from "../hooks/useDigest";
import { artwork, mediaMeta } from "../lib/media";

function weekOf(value: string | undefined) {
  const created = value ? new Date(value) : new Date();
  const date = Number.isNaN(created.getTime()) ? new Date() : created;

  return date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

function issueNumber(value: string | undefined) {
  const created = value ? new Date(value) : new Date();
  const date = Number.isNaN(created.getTime()) ? new Date() : created;
  const weeks = Math.floor((date.getTime() - Date.UTC(1974, 0, 1)) / (7 * 86_400_000));

  return weeks.toLocaleString();
}

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
  const returning = (digest?.episodes ?? []).filter(
    (episode) => episode.episode === 1 && (episode.season ?? 1) > 1,
  );

  return (
    <section className="page-section programme-page">
      <header className="programme">
        <div className="programme-masthead">
          <UsherMark face="idle" crop="head" />
          <div>
            <span>The Marquee</span>
            <p>Week of {weekOf(digest?.createdAt)}</p>
          </div>
          <em>No. {issueNumber(digest?.createdAt)}</em>
        </div>
        <h1>This week&rsquo;s programme</h1>
        <p className="programme-note">
          Printed Monday mornings from your own shelf, the schedule, and whatever the town has been
          reading about. Nobody asked me to keep doing this.
        </p>
      </header>

      {!isSignedIn && (
        <div className="honest-empty">
          <h2>Sign in first.</h2>
          <p>The programme is set from your own shelf, so it needs to know whose it is.</p>
        </div>
      )}

      {isSignedIn && isLoading && <p className="rails-building">Setting the programme…</p>}

      {isSignedIn && !isLoading && !digest && (
        <div className="honest-empty">
          <h2>Nothing to print yet.</h2>
          <p>Save a few things to your shelf. The first programme goes out on Monday.</p>
        </div>
      )}

      {digest?.lead?.item ? (
        <article className="programme-lead">
          <button
            type="button"
            className="programme-lead-art"
            onClick={() => digest.lead?.item && onOpen(digest.lead.item)}
          >
            {digest.lead.item.backdropUrl || digest.lead.item.posterUrl ? (
              <img
                src={
                  artwork(
                    digest.lead.item.backdropUrl ?? digest.lead.item.posterUrl,
                    780,
                    digest.lead.item.backdropUrl ? "backdrop" : "poster",
                  ) ?? ""
                }
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <ArtPlaceholder seed={digest.lead.item.id} label={digest.lead.item.title} wide />
            )}
          </button>
          <div className="programme-lead-copy">
            <span>The pick of the week</span>
            <h2>{digest.lead.item.title}</h2>
            <p className="programme-lead-meta">{mediaMeta(digest.lead.item)}</p>
            <blockquote>{digest.lead.line}</blockquote>
            <button
              type="button"
              className="programme-lead-open"
              onClick={() => digest.lead?.item && onOpen(digest.lead.item)}
            >
              See where to watch
            </button>
          </div>
        </article>
      ) : null}

      {digest && digest.numbers.shelved > 0 ? (
        <dl className="programme-numbers">
          <div>
            <dt>Added this week</dt>
            <dd>{digest.numbers.added}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{digest.numbers.finished}</dd>
          </div>
          <div>
            <dt>On your shelf</dt>
            <dd>{digest.numbers.shelved}</dd>
          </div>
          <div>
            <dt>In the building</dt>
            <dd>{digest.numbers.catalogue.toLocaleString()}</dd>
          </div>
        </dl>
      ) : null}

      {returning.length > 0 ? (
        <>
          <h2 className="digest-heading">Back this week</h2>
          <ul className="digest-episodes">
            {returning.map((episode) => (
              <li key={`back-${episode.showName}-${episode.airsAt}`}>
                <time dateTime={episode.airsAt}>{formatWhen(episode.airsAt)}</time>
                <strong>{episode.showName}</strong>
                <small>Series {episode.season} begins</small>
              </li>
            ))}
          </ul>
        </>
      ) : null}

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
          <h2 className="digest-heading">On the schedule</h2>
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
          <h2 className="digest-heading">What the town is reading about</h2>
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

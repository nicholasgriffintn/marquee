import { useEffect, useRef } from "react";

import type { CatalogSection, MediaTitle } from "../domain/catalog";
import { useAvailability } from "../hooks/useAvailability";
import { useTitleInsight } from "../hooks/useTitleInsight";
import { mediaMeta, scoreLabel, voteLabel } from "../lib/media";
import { ArtPlaceholder } from "./ArtPlaceholder";
import { ArrowIcon, PlusIcon, Poster, ProviderBadge } from "./ui";

const RAIL_PROVIDER_LIMIT = 3;

export function TitleCard({
  item,
  onOpen,
  rank,
}: {
  item: MediaTitle;
  onOpen: (title: MediaTitle) => void;
  rank?: number;
}) {
  return (
    <article className={`rail-card${item.pending ? " rail-card-pending" : ""}`}>
      <button
        type="button"
        className="rail-card-hit"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.title}`}
      >
        <div className={`rail-art${item.backdropUrl ? "" : " rail-art-missing"}`}>
          {item.backdropUrl ? (
            <img src={item.backdropUrl} alt="" loading="lazy" />
          ) : (
            <ArtPlaceholder seed={item.id} label={item.title} wide />
          )}
          <div className="rail-tags">
            {rank !== undefined && <span className="rail-rank">#{rank}</span>}
            <span className="rail-number">
              {item.pending ? "FETCHING" : item.mediaType === "movie" ? "FILM" : "TV"}
            </span>
          </div>
          <strong>{item.title}</strong>
          <div className="rail-provider-row">
            {item.providers.slice(0, RAIL_PROVIDER_LIMIT).map((provider) => (
              <ProviderBadge provider={provider} compact key={provider.id} />
            ))}
            {item.providers.length > RAIL_PROVIDER_LIMIT && (
              <span className="rail-provider-more">
                +{item.providers.length - RAIL_PROVIDER_LIMIT}
              </span>
            )}
          </div>
        </div>
      </button>
      <div className="rail-meta">
        <span className="source-label">
          TMDB {scoreLabel(item)}
          {voteLabel(item) && <em>{voteLabel(item)}</em>}
        </span>
        <span>{mediaMeta(item)}</span>
      </div>
    </article>
  );
}

export function ContentRail({
  section,
  onOpen,
}: {
  section: CatalogSection;
  onOpen: (title: MediaTitle) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  return (
    <section className="content-rail">
      <div className="rail-heading">
        <div>
          <span>{section.description}</span>
          <h2>{section.title}</h2>
        </div>
        <button
          type="button"
          aria-label={`Show more ${section.title}`}
          onClick={() => trackRef.current?.scrollBy({ left: 640, behavior: "smooth" })}
        >
          More <ArrowIcon />
        </button>
      </div>
      <div className="rail-track" ref={trackRef}>
        {section.items.length ? (
          section.items.map((item) => (
            <TitleCard key={`${section.id}-${item.id}`} item={item} onOpen={onOpen} />
          ))
        ) : (
          <p className="rail-empty">No titles found.</p>
        )}
      </div>
    </section>
  );
}

export function DetailPanel({
  item,
  isSaved,
  watchmodeEnabled,
  canSave,
  onClose,
  onOpen,
  onSave,
}: {
  item: MediaTitle;
  isSaved: boolean;
  watchmodeEnabled: boolean;
  canSave: boolean;
  onClose: () => void;
  onOpen: (item: MediaTitle) => void;
  onSave: (item: MediaTitle) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const providers = useAvailability(item, watchmodeEnabled);
  const { insight, pairs, isLoading: isInsightLoading } = useTitleInsight(item.id, canSave);
  const watchDestinations = providers.flatMap((provider) => {
    const href = provider.webUrl ?? item.watchLink;

    return href ? [{ provider, href }] : [];
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="detail-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <dialog open className="detail-panel" aria-modal="true" aria-labelledby="detail-title">
        <button
          ref={closeRef}
          type="button"
          className="detail-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
        <Poster item={item} wide />
        <div className="detail-copy">
          <h2 id="detail-title">{item.title}</h2>
          <p className="detail-meta">
            {item.mediaType === "movie" ? "Film" : "Television"} · {mediaMeta(item)}
          </p>
          {(insight || isInsightLoading) && (
            <div className="detail-insight">
              <span>
                <i>AI</i> Marquee read
              </span>
              {insight ? (
                <>
                  <p>{insight.hook}</p>
                  {insight.moods.length > 0 && (
                    <div className="detail-moods">
                      {insight.moods.map((mood) => (
                        <em key={mood}>{mood}</em>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="skeleton skeleton-line" />
                  <span className="skeleton skeleton-line short" />
                </>
              )}
            </div>
          )}
          <p className="detail-synopsis">{item.overview || "No synopsis available."}</p>
          <div className="score-row">
            <div>
              <strong>{scoreLabel(item)}</strong>
              <span>TMDB user score</span>
            </div>
            <div>
              <strong>{item.tmdbVoteCount.toLocaleString()}</strong>
              <span>TMDB votes</span>
            </div>
          </div>
          <div className="watch-actions">
            {watchDestinations.map(({ provider, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="watch-button"
                key={provider.id}
              >
                <ProviderBadge provider={provider} compact />
                <span>
                  {provider.name}
                  <small>{provider.offerTypes.join(" · ")}</small>
                </span>
                <ArrowIcon />
              </a>
            ))}
            {!watchDestinations.length && (
              <p className="availability-empty">No streaming options found.</p>
            )}
          </div>
          {canSave && (
            <button
              type="button"
              className="save-button"
              onClick={() => onSave(item)}
              disabled={isSaved}
            >
              <PlusIcon /> {isSaved ? "Already on my shelf" : "Save to my shelf"}
            </button>
          )}
          {pairs.length > 0 && (
            <div className="detail-pairs">
              <span>
                <i>AI</i> Watch next
              </span>
              {pairs.map((pair) => (
                <button
                  type="button"
                  key={pair.item.id}
                  className="detail-pair"
                  onClick={() => onOpen(pair.item)}
                >
                  {pair.item.posterUrl ? (
                    <img src={pair.item.posterUrl} alt="" loading="lazy" />
                  ) : (
                    <ArtPlaceholder seed={pair.item.id} label={pair.item.title} />
                  )}
                  <span>
                    <strong>{pair.item.title}</strong>
                    <small>{pair.reason}</small>
                  </span>
                  <ArrowIcon />
                </button>
              ))}
            </div>
          )}
          <div className="resource-links">
            <span>SOURCE LINKS</span>
            <a href={item.tmdbUrl} target="_blank" rel="noreferrer">
              TMDB <ArrowIcon />
            </a>
            {item.imdbUrl && (
              <a href={item.imdbUrl} target="_blank" rel="noreferrer">
                IMDb <ArrowIcon />
              </a>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}

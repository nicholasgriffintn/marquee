import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import type { CatalogSection, MediaTitle } from "../domain/catalog";
import { useAvailability } from "../hooks/useAvailability";
import { useTitleInsight } from "../hooks/useTitleInsight";
import { artwork, artworkSrcSet, mediaMeta, moneyLabel, scoreLabel, voteLabel } from "../lib/media";
import { track } from "../lib/telemetry";
import type { EntryStatus, ViewingEntry } from "../types";
import { ArtPlaceholder } from "./ArtPlaceholder";
import { ShelfForm } from "./ShelfForm";
import { TrailerBlock } from "./TrailerBlock";
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
            <img
              src={artwork(item.backdropUrl, 780, "backdrop") ?? item.backdropUrl}
              srcSet={artworkSrcSet(item.backdropUrl, 780, "backdrop")}
              alt=""
              loading="lazy"
              decoding="async"
            />
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
  const railRef = useRef<HTMLElement>(null);
  const seenRef = useRef(false);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail || seenRef.current || section.items.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !seenRef.current) {
          seenRef.current = true;
          track("rail_impression", section.id);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(rail);

    return () => observer.disconnect();
  }, [section.id, section.items.length]);

  return (
    <section className="content-rail" ref={railRef}>
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
            <TitleCard
              key={`${section.id}-${item.id}`}
              item={item}
              onOpen={(title) => {
                track("rail_click", section.id, title.id);
                onOpen(title);
              }}
            />
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
  availabilityEnabled,
  canSave,
  onClose,
  onOpen,
  onSave,
  onSaveEntry,
  entry,
  onRemove,
  onStatus,
  onUpdateDraft,
}: {
  item: MediaTitle;
  entry?: ViewingEntry;
  onRemove: (titleId: string) => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
  availabilityEnabled: boolean;
  canSave: boolean;
  onClose: () => void;
  onOpen: (item: MediaTitle) => void;
  onSave: (item: MediaTitle) => void;
  onSaveEntry: (entry: ViewingEntry) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { providers, nextEpisode } = useAvailability(item, availabilityEnabled);
  const { insight, pairs, isLoading: isInsightLoading } = useTitleInsight(item.id);
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
          {item.tagline && <p className="detail-tagline">{item.tagline}</p>}
          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="detail-original">Original title · {item.originalTitle}</p>
          )}
          {(item.studios?.length || item.collection) && (
            <p className="detail-original">
              {[item.collection?.name, item.studios?.slice(0, 2).join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
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
          {nextEpisode && (
            <p className="detail-next">
              <span>Next episode</span>
              {nextEpisode.season && nextEpisode.episode
                ? ` S${nextEpisode.season}E${nextEpisode.episode}`
                : ""}
              {nextEpisode.episodeName ? ` · ${nextEpisode.episodeName}` : ""} ·{" "}
              {new Date(nextEpisode.airsAt).toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {nextEpisode.network ? ` · ${nextEpisode.network}` : ""}
            </p>
          )}
          <TrailerBlock item={item} />
          <p className="detail-synopsis">{item.overview || "No synopsis available."}</p>
          {item.people?.length ? (
            <div className="detail-chips">
              {item.people.slice(0, 5).map((person) => (
                <Link
                  key={person}
                  to={`/films?q=${encodeURIComponent(person)}`}
                  className="detail-chip detail-chip-person"
                >
                  {person}
                </Link>
              ))}
            </div>
          ) : null}
          {item.keywords?.length ? (
            <div className="detail-chips">
              {item.keywords.slice(0, 8).map((keyword) => (
                <Link
                  key={keyword}
                  to={`/films?keywords=${encodeURIComponent(keyword)}`}
                  className="detail-chip"
                >
                  {keyword}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="score-row">
            <div>
              <strong>{scoreLabel(item)}</strong>
              <span>TMDB user score</span>
            </div>
            <div>
              <strong>{item.tmdbVoteCount.toLocaleString()}</strong>
              <span>TMDB votes</span>
            </div>
            {item.ratings?.imdbScore != null && (
              <div>
                <strong>{item.ratings.imdbScore.toFixed(1)}</strong>
                <span>
                  IMDb
                  {item.ratings.imdbVotes
                    ? ` · ${voteLabel({ ...item, tmdbScore: 1, tmdbVoteCount: item.ratings.imdbVotes })}`
                    : ""}
                </span>
              </div>
            )}
            {item.ratings?.rottenTomatoes && (
              <div>
                <strong>{item.ratings.rottenTomatoes}</strong>
                <span>Rotten Tomatoes</span>
              </div>
            )}
            {item.ratings?.metascore != null && (
              <div>
                <strong>{item.ratings.metascore}</strong>
                <span>Metascore</span>
              </div>
            )}
            {item.ratings?.anilistScore != null && (
              <div>
                <strong>{item.ratings.anilistScore}%</strong>
                <span>AniList</span>
              </div>
            )}
            {item.ratings?.boxOffice != null && (
              <div>
                <strong>{moneyLabel(item.ratings.boxOffice)}</strong>
                <span>Box office</span>
              </div>
            )}
            {item.revenue != null && item.ratings?.boxOffice == null && (
              <div>
                <strong>{moneyLabel(item.revenue)}</strong>
                <span>Worldwide gross</span>
              </div>
            )}
          </div>
          {item.ratings?.awards && <p className="detail-awards">{item.ratings.awards}</p>}
          {canSave && !entry && (
            <button type="button" className="save-button" onClick={() => onSave(item)}>
              <PlusIcon /> Save to my shelf
            </button>
          )}
          {canSave && entry && (
            <ShelfForm
              entry={entry}
              title={item.title}
              onRemove={onRemove}
              onSave={onSaveEntry}
              onStatus={onStatus}
              onUpdateDraft={onUpdateDraft}
            />
          )}
          <div className="watch-actions">
            <span>Watch Now</span>
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
                    <img
                      src={artwork(pair.item.posterUrl, 160) ?? pair.item.posterUrl}
                      srcSet={artworkSrcSet(pair.item.posterUrl, 160)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
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
            {item.trailerKey && (
              <a
                href={`https://www.youtube.com/watch?v=${item.trailerKey}`}
                target="_blank"
                rel="noreferrer"
              >
                Trailer <ArrowIcon />
              </a>
            )}
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

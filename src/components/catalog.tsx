import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";

import type { CatalogSection, MediaTitle } from "../domain/catalog";
import { blendedRating, ratingSources } from "../domain/ratings";
import { useAvailability } from "../hooks/useAvailability";
import { useRecommendations } from "../hooks/useRecommendations";
import { useShowings } from "../hooks/useShowings";
import { useTitleInsight } from "../hooks/useTitleInsight";
import { startJourney } from "../lib/journey";
import {
  artwork,
  artworkSrcSet,
  changeLabel,
  compactCount,
  mediaMeta,
  moneyLabel,
  scoreLabel,
  voteLabel,
} from "../lib/media";
import { track } from "../lib/telemetry";
import type { EntryStatus, ViewingEntry } from "../types";
import { ArtPlaceholder } from "./ArtPlaceholder";
import { ShowingsBlock } from "./cinema/ShowingsBlock";
import { ShelfForm } from "./ShelfForm";
import { TrailerBlock } from "./TrailerBlock";
import { ArrowIcon, ChevronIcon, PlusIcon, Poster, ProviderBadge } from "./ui";
import { ExitDoor, shouldWarnOnExit, type Exit } from "./usher/ExitDoor";
import { UsherMark } from "./usher/UsherMark";

const RAIL_PROVIDER_LIMIT = 3;
const SIMILAR_LIMIT = 12;
const RAIL_RATING_LIMIT = 3;

function measuredOn(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

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
        {item.buzz && (
          <span className="rail-buzz">
            Wikipedia {changeLabel(item.buzz.delta)}
            <em>{compactCount(item.buzz.views)} readers this week</em>
          </span>
        )}
        <RatingLine item={item} limit={RAIL_RATING_LIMIT} />
        <span>{mediaMeta(item)}</span>
      </div>
    </article>
  );
}

function RatingLine({ item, limit }: { item: MediaTitle; limit?: number }) {
  const sources = ratingSources(item);

  if (sources.length === 0) {
    return <span className="source-label">Not yet rated</span>;
  }

  const shown = limit ? sources.slice(0, limit) : sources;
  const votes = shown.find((source) => source.votes)?.votes ?? null;

  return (
    <span className="source-label">
      {shown
        .map(
          (source, index) =>
            `${source.label} ${source.display}${index === 0 && source.outOfTen ? " / 10" : ""}`,
        )
        .join(" · ")}
      {votes !== null && <em>{compactCount(votes)} votes</em>}
    </span>
  );
}

type RailScroll = {
  overflowing: boolean;
  atStart: boolean;
  atEnd: boolean;
  pages: number;
  page: number;
};

const RAIL_AT_REST: RailScroll = {
  overflowing: false,
  atStart: true,
  atEnd: true,
  pages: 1,
  page: 0,
};

function railPageWidth(element: HTMLElement) {
  const first = element.children[0] as HTMLElement | undefined;

  if (!first) {
    return element.clientWidth;
  }

  const second = element.children[1] as HTMLElement | undefined;
  const pitch = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;

  if (pitch <= 0) {
    return element.clientWidth;
  }

  return Math.max(1, Math.floor(element.clientWidth / pitch)) * pitch;
}

function useRailScroll(trackRef: RefObject<HTMLDivElement | null>) {
  const [scroll, setScroll] = useState(RAIL_AT_REST);

  const measure = useCallback(() => {
    const element = trackRef.current;

    if (!element) {
      return;
    }

    const distance = element.scrollWidth - element.clientWidth;
    const overflowing = distance > 1;
    const pageWidth = railPageWidth(element);
    const pages = overflowing ? Math.ceil(element.scrollWidth / pageWidth) : 1;
    const next: RailScroll = {
      overflowing,
      atStart: element.scrollLeft <= 1,
      atEnd: element.scrollLeft >= distance - 1,
      pages,
      page: Math.min(pages - 1, Math.max(0, Math.round(element.scrollLeft / pageWidth))),
    };

    setScroll((previous) =>
      previous.overflowing === next.overflowing &&
      previous.atStart === next.atStart &&
      previous.atEnd === next.atEnd &&
      previous.pages === next.pages &&
      previous.page === next.page
        ? previous
        : next,
    );
  }, [trackRef]);

  useEffect(measure);

  useEffect(() => {
    const element = trackRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [trackRef, measure]);

  return scroll;
}

export function ContentRail({
  section,
  onOpen,
  ranked,
  byUsher,
  trailing,
  onSeen,
}: {
  section: CatalogSection;
  onOpen: (title: MediaTitle) => void;
  ranked?: boolean;
  byUsher?: boolean;
  trailing?: ReactNode;
  onSeen?: (section: CatalogSection) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const seenRef = useRef(false);
  const seenCallback = useRef(onSeen);
  const scroll = useRailScroll(trackRef);

  const turn = useCallback((direction: 1 | -1) => {
    const element = trackRef.current;

    if (!element) {
      return;
    }

    element.scrollBy({
      left: direction * railPageWidth(element),
      behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, []);

  useEffect(() => {
    seenCallback.current = onSeen;
  }, [onSeen]);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail || seenRef.current || section.items.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !seenRef.current) {
          seenRef.current = true;
          track("rail_impression", { detail: section.id, source: section.angle ?? section.id });
          seenCallback.current?.(section);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(rail);

    return () => observer.disconnect();
  }, [section.id, section.items.length]);

  return (
    <section className={`content-rail${byUsher ? " rail-by-usher" : ""}`} ref={railRef}>
      <div className="rail-heading">
        <div>
          {byUsher ? (
            <span className="rail-eyebrow">
              <Link to="/usher" className="rail-usher-link" aria-label="Who is the Usher?">
                <UsherMark face="idle" crop="head" className="rail-usher" />
              </Link>
              <b>The Usher</b>
              {section.description && <em>· {section.description}</em>}
            </span>
          ) : (
            <span>{section.description}</span>
          )}
          <h2>{section.title}</h2>
        </div>
        {scroll.overflowing && (
          <div className="rail-pager">
            <span className="rail-pages" aria-hidden="true">
              {Array.from({ length: scroll.pages }, (_, index) => (
                <i
                  key={`${section.id}-page-${index}`}
                  className={index === scroll.page ? "is-current" : undefined}
                />
              ))}
            </span>
            <button
              type="button"
              aria-label={`Scroll ${section.title} back`}
              disabled={scroll.atStart}
              onClick={() => turn(-1)}
            >
              <ChevronIcon back />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${section.title} forward`}
              disabled={scroll.atEnd}
              onClick={() => turn(1)}
            >
              <ChevronIcon />
            </button>
          </div>
        )}
      </div>
      <div className="rail-track" ref={trackRef}>
        {section.items.length ? (
          section.items.map((item, index) => (
            <TitleCard
              key={`${section.id}-${item.id}`}
              item={item}
              rank={ranked ? index + 1 : undefined}
              onOpen={(title) => {
                startJourney(title.id, section.angle ?? section.id, index);
                track("rail_click", { detail: section.id, titleId: title.id });
                onOpen(title);
              }}
            />
          ))
        ) : (
          <p className="rail-empty">No titles found.</p>
        )}
        {trailing}
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
  usherSlot,
  onRemove,
  onStatus,
  onUpdateDraft,
}: {
  item: MediaTitle;
  entry?: ViewingEntry;
  usherSlot?: ReactNode;
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
  const consensus = blendedRating(item);
  const { providers, nextEpisode } = useAvailability(item, availabilityEnabled);
  const { insight, pairs, isLoading: isInsightLoading } = useTitleInsight(item.id);
  const similar = useRecommendations(item.id, item.recommendationIds, SIMILAR_LIMIT);
  const showings = useShowings(item, canSave);
  const [exit, setExit] = useState<Exit | null>(null);
  const panelRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const previous = panel.style.overflow;

    panel.style.overflow = exit ? "hidden" : previous;

    return () => {
      panel.style.overflow = previous;
    };
  }, [exit]);
  useEffect(() => {
    track("title_view", { titleId: item.id });
  }, [item.id]);

  const reportExit = (next: Exit) => {
    if (next.kind !== "provider") {
      return;
    }

    track("provider_exit", {
      detail: next.label,
      titleId: item.id,
      ...(next.providerId ? { providerId: next.providerId } : {}),
      ...(next.monetization ? { monetization: next.monetization } : {}),
    });
  };

  const leaveVia = (next: Exit) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldWarnOnExit()) {
      reportExit(next);

      return;
    }

    event.preventDefault();
    setExit(next);
  };

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
      <dialog
        open
        ref={panelRef}
        className="detail-panel"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
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
          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="detail-original">Original title · {item.originalTitle}</p>
          )}
          {item.tagline && <p className="detail-tagline">{item.tagline}</p>}
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
          <div className="watch-actions">
            <span>Watch now</span>
            {watchDestinations.map(({ provider, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="watch-button"
                key={provider.id}
                onClick={leaveVia({
                  href,
                  label: provider.name,
                  kind: "provider",
                  providerId: provider.id,
                  monetization: provider.offerTypes.join(","),
                })}
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
          <ShowingsBlock
            listings={showings.listings}
            isLoading={showings.isLoading}
            placeLabel={showings.origin?.label ?? null}
            onLeave={leaveVia}
          />
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
          {usherSlot}
          <TrailerBlock item={item} />
          <p className="detail-synopsis">{item.overview || "No synopsis available."}</p>
          <div className="score-row">
            {consensus && consensus.sources.length > 1 && (
              <div>
                <strong>{consensus.score.toFixed(1)}</strong>
                <span>
                  Marquee consensus · {consensus.sources.length} source
                  {consensus.sources.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
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
            {item.ratings?.boxOffice != null && item.ratings.boxOffice > 0 && (
              <div>
                <strong>{moneyLabel(item.ratings.boxOffice)}</strong>
                <span>Box office</span>
              </div>
            )}
            {item.revenue != null && item.revenue > 0 && !item.ratings?.boxOffice && (
              <div>
                <strong>{moneyLabel(item.revenue)}</strong>
                <span>Worldwide gross</span>
              </div>
            )}
          </div>
          {item.ratings?.awards && <p className="detail-awards">{item.ratings.awards}</p>}
          {item.people?.length ? (
            <div className="detail-chips">
              {item.people.slice(0, 5).map((person) => (
                <Link
                  key={person}
                  to={`/listings?type=${item.mediaType}&q=${encodeURIComponent(person)}`}
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
                  to={`/listings?type=${item.mediaType}&keywords=${encodeURIComponent(keyword)}`}
                  className="detail-chip"
                >
                  {keyword}
                </Link>
              ))}
            </div>
          ) : null}
          {item.buzz && (
            <div className="detail-buzz">
              <span>Trending signal</span>
              <p>
                <strong>{item.buzz.views.toLocaleString()}</strong> Wikipedia readers in the last 7
                days, {changeLabel(item.buzz.delta)} on the{" "}
                {item.buzz.previousViews.toLocaleString()} the week before.
              </p>
              <small>
                Article{" "}
                <a href={item.buzz.articleUrl} target="_blank" rel="noreferrer">
                  {item.buzz.article}
                </a>{" "}
                · matched by{" "}
                {item.buzz.match === "wikidata" ? "Wikidata IMDb link" : "title search"} · measured{" "}
                {measuredOn(item.buzz.measuredAt)}
              </small>
            </div>
          )}
          {(item.studios?.length || item.collection) && (
            <p className="detail-original">
              {[item.collection?.name, item.studios?.slice(0, 2).join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
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
          {similar.length > 0 && (
            <div className="detail-similar">
              <span>More like this</span>
              <div className="detail-similar-track">
                {similar.map((title) => (
                  <button
                    type="button"
                    key={title.id}
                    className="detail-similar-card"
                    onClick={() => onOpen(title)}
                  >
                    {title.posterUrl ? (
                      <img
                        src={artwork(title.posterUrl, 160) ?? title.posterUrl}
                        srcSet={artworkSrcSet(title.posterUrl, 160)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <ArtPlaceholder seed={title.id} label={title.title} />
                    )}
                    <strong>{title.title}</strong>
                    <small>{mediaMeta(title)}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="resource-links">
            <span>SOURCE LINKS</span>
            {item.trailerKey && (
              <a
                href={`https://www.youtube.com/watch?v=${item.trailerKey}`}
                target="_blank"
                rel="noreferrer"
                onClick={leaveVia({
                  href: `https://www.youtube.com/watch?v=${item.trailerKey}`,
                  label: "Trailer",
                  kind: "trailer",
                })}
              >
                Trailer <ArrowIcon />
              </a>
            )}
            <a
              href={item.tmdbUrl}
              target="_blank"
              rel="noreferrer"
              onClick={leaveVia({ href: item.tmdbUrl, label: "TMDB", kind: "tmdb" })}
            >
              TMDB <ArrowIcon />
            </a>
            {item.buzz && (
              <a
                href={item.buzz.articleUrl}
                target="_blank"
                rel="noreferrer"
                onClick={leaveVia({
                  href: item.buzz.articleUrl,
                  label: "Wikipedia",
                  kind: "wikipedia",
                })}
              >
                Wikipedia <ArrowIcon />
              </a>
            )}
            {item.imdbUrl && (
              <a
                href={item.imdbUrl}
                target="_blank"
                rel="noreferrer"
                onClick={leaveVia({ href: item.imdbUrl, label: "IMDb", kind: "imdb" })}
              >
                IMDb <ArrowIcon />
              </a>
            )}
          </div>
        </div>
        {exit && (
          <ExitDoor exit={exit} onLeave={() => reportExit(exit)} onClose={() => setExit(null)} />
        )}
      </dialog>
    </div>
  );
}

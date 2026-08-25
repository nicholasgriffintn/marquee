import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { mergeAnimeProviders } from "../../domain/anime";
import { collectionPath, type MediaTitle } from "../../domain/catalog";
import { useAvailability } from "../../hooks/useAvailability";
import { useCollection } from "../../hooks/useCollection";
import { useRecommendations } from "../../hooks/useRecommendations";
import { useTitleReels } from "../../hooks/useRevival";
import { useEpisodeEntries } from "../../hooks/useSeasons";
import { useShowings } from "../../hooks/useShowings";
import { useTitleInsight } from "../../hooks/useTitleInsight";
import { useWatchOrder } from "../../hooks/useWatchOrder";
import { detailMeta, languageLabel } from "../../lib/media";
import { track } from "../../lib/telemetry";
import type { EntryStatus, ViewingEntry } from "../../types";
import { ShowingsBlock } from "../cinema/ShowingsBlock";
import { ErrorBoundary } from "../ErrorBoundary";
import { RevivalBlock } from "../revival/RevivalBlock";
import { SeasonsBlock } from "../seasons";
import { ShelfForm } from "../ShelfForm";
import { TrailerBlock } from "../TrailerBlock";
import { ArrowIcon, PlusIcon, Poster } from "../ui";
import { ExitDoor } from "../usher/ExitDoor";
import { WatchBlock } from "../WatchBlock";
import { AirLine } from "./AirLine";
import { BuzzNote } from "./BuzzNote";
import { CreditsBlock } from "./CreditsBlock";
import { MarqueeRead } from "./MarqueeRead";
import { ScoreRow } from "./ScoreRow";
import { SourceLinks } from "./SourceLinks";
import { ThemeSongs } from "./ThemeSongs";
import { collectionCaption, similarCaption, TitleTrack } from "./TitleTrack";
import { useExitWarning } from "./useExitWarning";
import { WatchNext } from "./WatchNext";
import { WatchOrder } from "./WatchOrder";

const SIMILAR_LIMIT = 12;
const DETAIL_TABS = ["overview", "episodes"] as const;
const KEYWORDS_SHOWN = 8;
const STUDIOS_SHOWN = 2;
const COUNTRIES_SHOWN = 2;

type DetailTab = (typeof DETAIL_TABS)[number];

type DetailView = {
  titleId: string;
  tab: DetailTab;
  jump: { season: number; nonce: number } | null;
};

export function DetailPanel({
  item,
  availabilityEnabled,
  canSave,
  onClose,
  onOpen,
  onSave,
  onSaveEntry,
  entry,
  selectedProviderIds,
  usherSlot,
  onRemove,
  onStatus,
  onTracked,
  onUpdateDraft,
}: {
  item: MediaTitle;
  entry?: ViewingEntry;
  selectedProviderIds: string[];
  usherSlot?: ReactNode;
  onRemove: (titleId: string) => void;
  onStatus: (titleId: string, status: EntryStatus) => void;
  onTracked?: () => void;
  onUpdateDraft: (titleId: string, patch: Partial<ViewingEntry>) => void;
  availabilityEnabled: boolean;
  canSave: boolean;
  onClose: () => void;
  onOpen: (item: MediaTitle) => void;
  onSave: (item: MediaTitle) => void;
  onSaveEntry: (entry: ViewingEntry) => void;
}) {
  const isSeries = item.mediaType === "tv";
  const [view, setView] = useState<DetailView>({ titleId: item.id, tab: "overview", jump: null });
  const live = view.titleId === item.id ? view : null;
  const tab = live?.tab ?? "overview";
  const jump = live?.jump ?? null;
  const setTab = (next: DetailTab) => setView({ titleId: item.id, tab: next, jump });
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDialogElement>(null);
  const tracker = useEpisodeEntries(item.id, canSave);
  const progress = tracker.progress;
  const continueAt = isSeries && progress && progress.watched > 0 ? progress.upNext : null;
  const { providers, nextEpisode, isRefreshing } = useAvailability(item, availabilityEnabled);
  const watchProviders = mergeAnimeProviders(item, providers);
  const watchOrder = useWatchOrder(item);
  const { insight, pairs, isLoading: isInsightLoading } = useTitleInsight(item.id);
  const similar = useRecommendations(item.id, item.recommendationIds, SIMILAR_LIMIT);
  const showings = useShowings(item, canSave);
  const reels = useTitleReels(item.id, item.mediaType, item.tmdbId);
  const collection = useCollection(item.collection?.id);
  const spokenIn = languageLabel(item.originalLanguage);
  const madeIn = item.countries?.slice(0, COUNTRIES_SHOWN).join(", ") ?? "";
  const { exit, leaveVia, report, dismiss } = useExitWarning(item.id);

  const resumeWatching = () => {
    if (!continueAt) {
      return;
    }

    setView({
      titleId: item.id,
      tab: "episodes",
      jump: { season: continueAt.season, nonce: (jump?.nonce ?? 0) + 1 },
    });
  };

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return undefined;
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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();

        return;
      }

      if (event.key !== "Tab" || exit) {
        return;
      }

      const panel = panelRef.current;
      const focusable = panel
        ? [
            ...panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ].filter((element) => element.offsetParent !== null)
        : [];

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const isInside = panel?.contains(document.activeElement);

      if (event.shiftKey) {
        if (!isInside || document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!isInside || document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [exit, onClose]);

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
            {item.mediaType === "movie" ? "Film" : "Television"} · {detailMeta(item)}
          </p>
          {item.originalTitle && item.originalTitle !== item.title && (
            <p className="detail-original">Original title · {item.originalTitle}</p>
          )}
          {(item.studios?.length || spokenIn || madeIn) && (
            <p className="detail-original">
              {[
                item.studios?.slice(0, STUDIOS_SHOWN).join(", "),
                madeIn ? `From ${madeIn}` : null,
                spokenIn ? `In ${spokenIn}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {item.tagline && <p className="detail-tagline">{item.tagline}</p>}
          {isSeries && (
            <div className="detail-tabs" role="tablist" aria-label="Overview or episodes">
              {DETAIL_TABS.map((name) => (
                <button
                  type="button"
                  key={name}
                  role="tab"
                  id={`detail-tab-${name}`}
                  aria-selected={tab === name}
                  aria-controls={`detail-panel-${name}`}
                  className={`detail-tab${tab === name ? " selected" : ""}`}
                  onClick={() => setTab(name)}
                >
                  {name === "overview" ? "Overview" : "Episodes"}
                  {name === "episodes" && item.episodeCount ? <em>{item.episodeCount}</em> : null}
                </button>
              ))}
            </div>
          )}
          <div
            className="detail-tab-panel"
            id="detail-panel-overview"
            role={isSeries ? "tabpanel" : undefined}
            aria-labelledby={isSeries ? "detail-tab-overview" : undefined}
            hidden={isSeries && tab !== "overview"}
          >
            <p className="detail-synopsis">{item.overview || "No synopsis available."}</p>
            {item.anime?.background && (
              <p className="detail-background">
                {item.anime.background}
                <small className="detail-credit">Background from MyAnimeList</small>
              </p>
            )}
            <MarqueeRead insight={insight} isLoading={isInsightLoading} />
            {canSave && (
              <ErrorBoundary label="The shelf card">
                {entry ? (
                  <ShelfForm
                    entry={entry}
                    title={item.title}
                    onRemove={onRemove}
                    onSave={onSaveEntry}
                    onStatus={onStatus}
                    onUpdateDraft={onUpdateDraft}
                  />
                ) : (
                  <button type="button" className="save-button" onClick={() => onSave(item)}>
                    <PlusIcon /> Save to my shelf
                  </button>
                )}
              </ErrorBoundary>
            )}
            <AirLine item={item} nextEpisode={nextEpisode} />
            <WatchOrder label="Before this" entries={watchOrder.before} onOpen={onOpen} />
            <ErrorBoundary label="Where to watch">
              <WatchBlock
                providers={watchProviders}
                fallbackHref={item.watchLink}
                selectedProviderIds={selectedProviderIds}
                hideIfEmpty={reels.length > 0}
                isRefreshing={isRefreshing}
                onLeave={leaveVia}
              />
            </ErrorBoundary>
            <WatchOrder label="After this" entries={watchOrder.after} onOpen={onOpen} />
            <WatchOrder label="Related" entries={watchOrder.related} onOpen={onOpen} />
            {continueAt && (
              <button type="button" className="detail-continue" onClick={resumeWatching}>
                <span>
                  Continue S{continueAt.season} E{continueAt.episode}
                </span>
                <ArrowIcon />
              </button>
            )}
            <ErrorBoundary label="The revival house">
              <RevivalBlock works={reels} />
            </ErrorBoundary>
            <ErrorBoundary label="Local showings">
              <ShowingsBlock
                listings={showings.listings}
                isLoading={showings.isLoading}
                placeLabel={showings.origin?.label ?? null}
                onLeave={leaveVia}
              />
            </ErrorBoundary>
            <ErrorBoundary label="The trailer">
              <TrailerBlock item={item} />
            </ErrorBoundary>
            <ThemeSongs item={item} />
            {usherSlot}
            <ScoreRow item={item} />
            {item.buzz && <BuzzNote buzz={item.buzz} />}
            <ErrorBoundary label="The credits">
              <CreditsBlock titleId={item.id} />
            </ErrorBoundary>
            {item.keywords?.length ? (
              <div className="detail-chips">
                {item.keywords.slice(0, KEYWORDS_SHOWN).map((keyword) => (
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
            <WatchNext pairs={pairs} onOpen={onOpen} />
            {item.collection && collection.items.length > 1 && (
              <TitleTrack
                label={item.collection.name}
                items={collection.items}
                currentId={item.id}
                caption={collectionCaption}
                onOpen={onOpen}
                footer={
                  collection.hasMore ? (
                    <Link className="detail-similar-more" to={collectionPath(item.collection.id)}>
                      See the whole collection
                    </Link>
                  ) : undefined
                }
              />
            )}
            <TitleTrack
              label="More like this"
              items={similar}
              caption={similarCaption}
              onOpen={onOpen}
            />
            <SourceLinks item={item} onLeave={leaveVia} />
          </div>
          {isSeries && (
            <div
              className="detail-tab-panel"
              id="detail-panel-episodes"
              role="tabpanel"
              aria-labelledby="detail-tab-episodes"
              hidden={tab !== "episodes"}
            >
              <ErrorBoundary label="The episode guide">
                <SeasonsBlock
                  item={item}
                  canTrack={canSave}
                  shelved={Boolean(entry)}
                  tracker={tracker}
                  jumpTo={jump}
                  onTracked={entry ? undefined : onTracked}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
        {exit && <ExitDoor exit={exit} onLeave={() => report(exit)} onClose={dismiss} />}
      </dialog>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";

import { mergeAnimeProviders } from "../../domain/anime";
import { collectionPath, type MediaTitle } from "../../domain/catalog";
import { removalDisclosure, type ProfileEntryState } from "../../domain/profile-entry";
import { useAdaptations } from "../../hooks/useAdaptations";
import { useAnimeRecommendations } from "../../hooks/useAnimeRecommendations";
import { useAvailability } from "../../hooks/useAvailability";
import { useCollection } from "../../hooks/useCollection";
import { useJourneyOpen } from "../../hooks/useJourneyOpen";
import { useRecommendations } from "../../hooks/useRecommendations";
import { useTitleReels } from "../../hooks/useRevival";
import { useEpisodeEntries, useSeasons } from "../../hooks/useSeasons";
import { useShowings } from "../../hooks/useShowings";
import { useTitleInsight } from "../../hooks/useTitleInsight";
import { useWatchOrder } from "../../hooks/useWatchOrder";
import { classNames } from "../../lib/class-names";
import { focusableElements } from "../../lib/focus";
import { detailMeta, languageLabel } from "../../lib/media";
import { track } from "../../lib/telemetry";
import type { EntryStatus, ViewingEntry } from "../../types";
import {
  ArrowIcon,
  Button,
  ChipLink,
  Eyebrow,
  Heading,
  PlusIcon,
  StatusNote,
  TabList,
  TabPanel,
  Text,
  type TabItem,
} from "../../ui";
import { ShowingsBlock } from "../cinema/ShowingsBlock";
import { ErrorBoundary } from "../ErrorBoundary";
import { Poster } from "../Poster";
import { RevivalBlock } from "../revival/RevivalBlock";
import { SeasonsBlock } from "../seasons";
import { ShelfForm } from "../ShelfForm";
import { TrailerBlock } from "../TrailerBlock";
import { ExitDoor } from "../usher/ExitDoor";
import { WatchBlock } from "../WatchBlock";
import { AirLine } from "./AirLine";
import { BuzzNote } from "./BuzzNote";
import { CastAndStaff } from "./CastAndStaff";
import { CreditsBlock } from "./CreditsBlock";
import { DetailCredit } from "./DetailNote";
import { FilmingLine } from "./FilmingLine";
import { MarqueeRead } from "./MarqueeRead";
import { ScoreRow } from "./ScoreRow";
import { SeasonsRail } from "./SeasonsRail";
import { SourceLinks } from "./SourceLinks";
import { SourceWorkLine, SourceWorkTrack } from "./SourceWorkBlock";
import { ThemeSongs } from "./ThemeSongs";
import { TitleAwards } from "./TitleAwards";
import { collectionCaption, similarCaption, TitleTrack } from "./TitleTrack";
import { useExitWarning } from "./useExitWarning";
import { VisualFormatLine } from "./VisualFormatLine";
import { WatchNext } from "./WatchNext";
import { WatchOrder } from "./WatchOrder";

import styles from "./DetailPanel.module.css";

const SIMILAR_LIMIT = 12;
const DETAIL_TABS = ["overview", "episodes"] as const;
const TAB_LABELS: Record<(typeof DETAIL_TABS)[number], string> = {
  overview: "Overview",
  episodes: "Episodes",
};
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
  layout = "overlay",
  panelRef,
  availabilityEnabled,
  canSave,
  onClose,
  onOpen,
  onSave,
  onSaveEntry,
  entryState,
  selectedProviderIds,
  usherSlot,
  onRemove,
  onRetryEntry,
  onStatus,
  onTracked,
  onUpdateDraft,
}: {
  item: MediaTitle;
  layout?: "overlay" | "page";
  panelRef: RefObject<HTMLDialogElement | null>;
  entryState: ProfileEntryState;
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
  onRetryEntry: () => void;
}) {
  const isModal = layout === "overlay";
  const isSeries = item.mediaType === "tv";
  const entry = entryState.status === "loaded" ? entryState.entry : null;
  const [view, setView] = useState<DetailView>({
    titleId: item.id,
    tab: "overview",
    jump: null,
  });
  const live = view.titleId === item.id ? view : null;
  const tab = live?.tab ?? "overview";
  const jump = live?.jump ?? null;
  const setTab = (next: DetailTab) => setView({ titleId: item.id, tab: next, jump });
  const tracker = useEpisodeEntries(item.id, canSave);
  const progress = tracker.progress;
  const seasons = useSeasons(item, isSeries, progress);
  const continueAt = isSeries && progress && progress.watched > 0 ? progress.upNext : null;
  const { providers, nextEpisode, isRefreshing } = useAvailability(item, availabilityEnabled);
  const watchProviders = mergeAnimeProviders(item, providers);
  const watchOrder = useWatchOrder(item);
  const {
    insight,
    pairs,
    journey: insightJourney,
    isLoading: isInsightLoading,
  } = useTitleInsight(item.id);
  const openPair = useJourneyOpen(onOpen, {
    journey: insightJourney,
    titleIds: pairs.map((pair) => pair.item.id),
  });
  const similar = useRecommendations(item.id, item.recommendationIds, SIMILAR_LIMIT);
  const malSimilar = useAnimeRecommendations(item);
  const showings = useShowings(item, canSave);
  const reels = useTitleReels(item.id, item.mediaType, item.tmdbId);
  const collection = useCollection(item.collection?.id);
  const adaptations = useAdaptations(item.id);
  const spokenIn = languageLabel(item.originalLanguage);
  const madeIn = item.countries?.slice(0, COUNTRIES_SHOWN).join(", ") ?? "";
  const { exit, leaveVia, report, dismiss } = useExitWarning(item.id);
  const exitOpenRef = useRef(Boolean(exit));
  const viewedTitleId = useRef("");

  useEffect(() => {
    exitOpenRef.current = Boolean(exit);
  }, [exit]);

  const openSeason = (season: number) =>
    setView({
      titleId: item.id,
      tab: "episodes",
      jump: { season, nonce: (jump?.nonce ?? 0) + 1 },
    });

  const resumeWatching = () => {
    if (continueAt) {
      openSeason(continueAt.season);
    }
  };

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel || !isModal) {
      return undefined;
    }

    const previous = panel.style.overflow;

    panel.style.overflow = exit ? "hidden" : previous;

    return () => {
      panel.style.overflow = previous;
    };
  }, [exit, isModal, panelRef]);

  useEffect(() => {
    if (viewedTitleId.current === item.id) {
      return;
    }

    viewedTitleId.current = item.id;
    track("title_view", { titleId: item.id });
  }, [item.id]);

  useEffect(() => {
    if (!isModal) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();

        return;
      }

      if (event.key !== "Tab" || exitOpenRef.current) {
        return;
      }

      const panel = panelRef.current;
      const focusable = panel ? focusableElements(panel) : [];

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

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isModal, onClose, panelRef]);

  return (
    <>
      <Poster
        item={item}
        wide
        className={classNames(styles.art, isModal ? undefined : styles.pageArt)}
      />
      <div className={classNames(styles.copy, isModal ? undefined : styles.pageCopy)}>
        <Heading level={isModal ? 2 : 1} size="title" id="detail-title" tone="ink">
          {item.title}
        </Heading>
        <Eyebrow weight="regular" tone="inkMuted" className={styles.meta}>
          {item.mediaType === "movie" ? "Film" : "Television"} · {detailMeta(item)}
        </Eyebrow>
        {item.originalTitle && item.originalTitle !== item.title && (
          <Eyebrow weight="regular" tone="inkMuted" className={styles.line}>
            Original title · {item.originalTitle}
          </Eyebrow>
        )}
        {(item.studios?.length || spokenIn || madeIn) && (
          <Eyebrow weight="regular" tone="inkMuted" className={styles.line}>
            {[
              item.studios?.slice(0, STUDIOS_SHOWN).join(", "),
              madeIn ? `From ${madeIn}` : null,
              spokenIn ? `In ${spokenIn}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Eyebrow>
        )}
        <SourceWorkLine source={adaptations.source} />
        {item.tagline && (
          <Text family="serif" italic className={styles.tagline}>
            {item.tagline}
          </Text>
        )}
        {isSeries && (
          <TabList
            label="Overview or episodes"
            idPrefix="detail"
            surface="paper"
            selected={tab}
            tabs={DETAIL_TABS.map((name): TabItem => ({
              id: name,
              label: TAB_LABELS[name],
              count: name === "episodes" ? (item.episodeCount ?? undefined) : undefined,
            }))}
            onSelect={(next) => setTab(next as DetailTab)}
          />
        )}
        <TabPanel
          id="overview"
          idPrefix="detail"
          labelled={isSeries}
          hidden={isSeries && tab !== "overview"}
        >
          <Text size="lede" leading="relaxed" className={styles.synopsis}>
            {item.overview || "No synopsis available."}
          </Text>
          {item.anime?.background && (
            <Text size="sm" leading="relaxed" className={styles.background}>
              {item.anime.background}
              <DetailCredit>Background from MyAnimeList</DetailCredit>
            </Text>
          )}
          <MarqueeRead insight={insight} isLoading={isInsightLoading} />
          <AirLine item={item} nextEpisode={nextEpisode} />
          {continueAt && (
            <button type="button" className={styles.continue} onClick={resumeWatching}>
              <span>
                Continue S{continueAt.season} E{continueAt.episode}
              </span>
              <ArrowIcon />
            </button>
          )}
          {isSeries && (
            <SeasonsRail
              seasons={seasons}
              onOpenSeason={openSeason}
              onOpenAll={() => setTab("episodes")}
            />
          )}
          {item.collection && collection.items.length > 1 && (
            <TitleTrack
              label={item.collection.name}
              items={collection.items}
              currentId={item.id}
              caption={collectionCaption}
              onOpen={onOpen}
              footer={
                collection.hasMore ? (
                  <Link className={styles.collectionLink} to={collectionPath(item.collection.id)}>
                    See the whole collection
                  </Link>
                ) : undefined
              }
            />
          )}
          {canSave && (
            <ErrorBoundary label="The shelf card">
              {entryState.status === "idle" || entryState.status === "loading" ? (
                <StatusNote busy surface="paper" live="polite">
                  Checking your shelf…
                </StatusNote>
              ) : entryState.status === "error" ? (
                <div role="alert" className={styles.entryError}>
                  <StatusNote surface="paper">
                    Your saved shelf entry could not be checked. No changes have been made.
                  </StatusNote>
                  {entryState.retryable && (
                    <Button
                      variant="primary"
                      size="lg"
                      surface="paper"
                      fullWidth
                      className={styles.save}
                      onClick={onRetryEntry}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              ) : entryState.entry ? (
                <ShelfForm
                  entry={entryState.entry}
                  title={item.title}
                  isSeries={isSeries}
                  confirmRemove={() => window.confirm(removalDisclosure(isSeries))}
                  onRemove={onRemove}
                  onSave={onSaveEntry}
                  onStatus={onStatus}
                  onUpdateDraft={onUpdateDraft}
                />
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  surface="paper"
                  fullWidth
                  className={styles.save}
                  onClick={() => onSave(item)}
                >
                  <PlusIcon /> Save to my shelf
                </Button>
              )}
            </ErrorBoundary>
          )}
          <WatchOrder label="Before this" entries={watchOrder.before} onOpen={onOpen} />
          <ErrorBoundary label="Where to watch">
            <WatchBlock
              title={item.title}
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
          <SourceWorkTrack
            source={adaptations.source}
            items={adaptations.items}
            currentId={item.id}
            onOpen={onOpen}
          />
          <ErrorBoundary label="The revival house">
            <RevivalBlock works={reels} />
          </ErrorBoundary>
          <ErrorBoundary label="Local showings">
            <ShowingsBlock
              listings={showings.listings}
              isLoading={showings.isLoading}
              error={showings.error}
              placeLabel={showings.origin?.label ?? null}
              onLeave={leaveVia}
            />
          </ErrorBoundary>
          <ErrorBoundary label="The trailer">
            <TrailerBlock item={item} />
          </ErrorBoundary>
          {usherSlot}
          <ScoreRow item={item} />
          <TitleAwards titleId={item.id} />
          {item.buzz && <BuzzNote buzz={item.buzz} />}
          <CastAndStaff item={item} />
          {item.visualFormat && <VisualFormatLine format={item.visualFormat} />}
          <FilmingLine titleId={item.id} />
          {item.keywords?.length ? (
            <div className={styles.chips}>
              {item.keywords.slice(0, KEYWORDS_SHOWN).map((keyword) => (
                <ChipLink
                  key={keyword}
                  surface="paper"
                  to={`/listings?type=${item.mediaType}&keywords=${encodeURIComponent(keyword)}`}
                >
                  {keyword}
                </ChipLink>
              ))}
            </div>
          ) : null}
          <ThemeSongs item={item} />
          <ErrorBoundary label="The credits">
            <CreditsBlock key={item.id} titleId={item.id} people={item.people ?? []} />
          </ErrorBoundary>
          <WatchNext pairs={pairs} onOpen={openPair} />
          <TitleTrack
            label="More like this"
            items={similar}
            caption={similarCaption}
            onOpen={onOpen}
          />
          <TitleTrack
            label="MyAnimeList recommends"
            items={malSimilar}
            caption={similarCaption}
            onOpen={onOpen}
          />
          <SourceLinks item={item} onLeave={leaveVia} />
        </TabPanel>
        {isSeries && (
          <TabPanel
            id="episodes"
            idPrefix="detail"
            hidden={tab !== "episodes"}
            className={styles.episodes}
          >
            <ErrorBoundary label="The episode guide">
              <SeasonsBlock
                key={item.id}
                canTrack={canSave}
                shelved={Boolean(entry)}
                tracker={tracker}
                seasons={seasons}
                jumpTo={jump}
                onTracked={entry ? undefined : onTracked}
              />
            </ErrorBoundary>
          </TabPanel>
        )}
      </div>
      {exit && <ExitDoor exit={exit} onLeave={() => report(exit)} onClose={dismiss} />}
    </>
  );
}

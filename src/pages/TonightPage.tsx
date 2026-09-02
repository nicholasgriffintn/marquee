import { useEffect, useMemo, useState } from "react";

import { ContentRail } from "../components/ContentRail";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  Hero,
  HeroAction,
  HeroActions,
  HeroArt,
  HeroCopy,
  HeroGradient,
  HeroLede,
  HeroMeta,
  HeroTitle,
} from "../components/hero/Hero";
import { ProviderBadge } from "../components/ProviderBadge";
import { Rail, RailTrack } from "../components/rail/Rail";
import { UsherBanner } from "../components/usher/UsherBanner";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherConsole } from "../components/usher/UsherConsole";
import { UsherHero } from "../components/usher/UsherHero";
import { UsherOnboarding } from "../components/usher/UsherOnboarding";
import { UsherOrder } from "../components/usher/UsherOrder";
import type { CatalogSection, MediaTitle, Provider } from "../domain/catalog";
import type { Guest } from "../domain/notebook";
import { isCuratedRailId, isViewerShelfId } from "../domain/rails";
import type { TonightOrder, UsherMoment } from "../domain/usher";
import type { CuratorState } from "../hooks/useCurator";
import type { ScheduledEpisode } from "../hooks/useTonight";
import type { UsherOrderState, UsherPickState } from "../hooks/useUsher";
import { classNames } from "../lib/class-names";
import { parseDate } from "../lib/dates";
import { mediaMeta, scoreLabel } from "../lib/media";
import { ArrowIcon, Callout, ExternalLinkIcon, Heading, Skeleton, StatusNote, Text } from "../ui";

import styles from "./TonightPage.module.css";

const IDLE_NUDGE_MS = 40_000;
const RAIL_SKELETONS = [0, 1];
const CARD_SKELETONS = [0, 1, 2, 3, 4];

function formatAirTime(value: string) {
  const airsAt = parseDate(value);

  if (!airsAt) {
    return "";
  }

  const isToday = airsAt.toDateString() === new Date().toDateString();
  const time = airsAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return isToday ? time : `${airsAt.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

export function TonightPage({
  curator,
  curatorError,
  isAsking,
  isLoading,
  isBuildingRails,
  isSessionLoading,
  error,
  providerError,
  sections,
  featured,
  isHeroReady,
  episodes,
  trending,
  providers,
  selectedProviderIds,
  isPinned,
  usherMoment,
  pick,
  order,
  guests,
  aside,
  onAsk,
  onClearCurator,
  onOpen,
  onPin,
  onPick,
  onRejectPick,
  onStartOrder,
  onOrder,
  onOrderAnother,
  onOrderEdit,
  onSelectProviders,
  onShowSources,
  onUsherAction,
  onUsherAnswer,
  onUsherDismiss,
  onUsherSkip,
  onRailSeen,
}: {
  curator: CuratorState;
  curatorError: string;
  isAsking: boolean;
  isLoading: boolean;
  isBuildingRails: boolean;
  isSessionLoading: boolean;
  error: string;
  providerError: string;
  sections: CatalogSection[];
  featured: MediaTitle | undefined;
  isHeroReady: boolean;
  episodes: ScheduledEpisode[];
  trending: MediaTitle[];
  providers: Provider[];
  selectedProviderIds: string[];
  isPinned: boolean;
  usherMoment: UsherMoment | null;
  pick: UsherPickState;
  order: UsherOrderState;
  guests: Guest[];
  aside: string;
  onAsk: (prompt: string, isRefinement?: boolean) => Promise<void>;
  onClearCurator: () => void;
  onOpen: (item: MediaTitle) => void;
  onPin: () => void;
  onPick: () => void;
  onRejectPick: (scope?: "never") => void;
  onStartOrder: () => void;
  onOrder: (order: TonightOrder, guestIds: string[]) => void;
  onOrderAnother: () => void;
  onOrderEdit: () => void;
  onSelectProviders: (ids: string[]) => void;
  onShowSources: () => void;
  onUsherAction: (moment: UsherMoment, actionId: string) => void;
  onUsherAnswer: (questionId: string, value: unknown) => Promise<unknown>;
  onUsherDismiss: (scope: "once" | "kind" | "all") => void;
  onUsherSkip: (questionId: string) => void;
  onRailSeen: (section: CatalogSection) => void;
}) {
  const [isIdle, setIsIdle] = useState(false);
  const isUsherMode = Boolean(
    curator.prompt ||
    curatorError ||
    pick.item ||
    pick.isPicking ||
    pick.error ||
    aside ||
    order.isOpen,
  );
  const onboardingMoment = usherMoment?.surface === "first-run" ? usherMoment : null;
  const dripMoment = usherMoment?.surface === "home" ? usherMoment : null;

  useEffect(() => {
    if (isUsherMode) {
      return undefined;
    }

    const timer = window.setTimeout(() => setIsIdle(true), IDLE_NUDGE_MS);

    return () => window.clearTimeout(timer);
  }, [isUsherMode]);
  const readyFeatured = isHeroReady ? featured : undefined;
  const filterableProviders = providers.filter((provider) =>
    provider.capabilities?.includes("preference"),
  );

  const trendingSection = useMemo(
    () => ({
      id: "trending",
      title: "Trending now",
      description: "Wikipedia readers this week against last",
      items: trending,
    }),
    [trending],
  );

  function toggleProvider(id: string) {
    onSelectProviders(
      selectedProviderIds?.includes(id)
        ? selectedProviderIds.filter((providerId) => providerId !== id)
        : [...selectedProviderIds, id],
    );
  }

  return (
    <>
      <div className={styles.heroShell}>
        <ErrorBoundary label="The front of house">
          {onboardingMoment ? (
            <UsherOnboarding
              moment={onboardingMoment}
              providers={filterableProviders}
              onAnswer={onUsherAnswer}
              onSkip={onUsherSkip}
              onDismiss={() => onUsherDismiss("all")}
            />
          ) : order.isOpen ? (
            <UsherOrder
              state={order}
              guests={guests}
              onSubmit={onOrder}
              onOpen={onOpen}
              onAnother={onOrderAnother}
              onEdit={onOrderEdit}
              onClose={onClearCurator}
            />
          ) : isUsherMode ? (
            <UsherHero
              curator={curator}
              error={curatorError}
              isAsking={isAsking}
              isPinned={isPinned}
              pick={pick}
              aside={aside}
              onAsk={(prompt, isRefinement) => void onAsk(prompt, isRefinement)}
              onClear={onClearCurator}
              onOpen={onOpen}
              onPin={onPin}
              onReject={onRejectPick}
            />
          ) : (
            <Hero empty={!readyFeatured?.backdropUrl}>
              {readyFeatured && <HeroArt item={readyFeatured} />}
              <HeroGradient />
              <HeroCopy>
                {readyFeatured ? (
                  <>
                    <HeroTitle title={readyFeatured.title} />
                    <HeroMeta>
                      {mediaMeta(readyFeatured)} · {scoreLabel(readyFeatured)}
                    </HeroMeta>
                    <HeroLede>{readyFeatured.overview || "No synopsis available."}</HeroLede>
                    <HeroActions>
                      <HeroAction
                        variant="primary"
                        icon={<ExternalLinkIcon />}
                        onClick={() => onOpen(readyFeatured)}
                      >
                        See where to watch
                      </HeroAction>
                    </HeroActions>
                  </>
                ) : !isHeroReady ? (
                  <div className={styles.heroSkeleton} aria-hidden="true">
                    <Skeleton shape="title" />
                    <Skeleton shape="meta" />
                    <Skeleton />
                    <Skeleton short />
                    <Skeleton shape="button" />
                  </div>
                ) : (
                  <div aria-live="polite">
                    <Heading level={1} size="display">
                      Nothing matched.
                    </Heading>
                    <Text tone="muted" className={styles.heroEmpty}>
                      {error || "Try another search or change your services."}
                    </Text>
                  </div>
                )}
              </HeroCopy>
            </Hero>
          )}
          {!onboardingMoment && !isUsherMode && (
            <UsherConsole
              isAsking={isAsking}
              isPicking={pick.isPicking}
              isIdle={isIdle}
              hasAsked={isUsherMode}
              onAsk={(value) => void onAsk(value)}
              onPick={onPick}
              onOrder={onStartOrder}
            />
          )}
        </ErrorBoundary>
      </div>

      {dripMoment && (
        <UsherBanner
          moment={dripMoment}
          providers={filterableProviders}
          onAnswer={onUsherAnswer}
          onSkip={onUsherSkip}
          onAction={onUsherAction}
          onDismiss={onUsherDismiss}
        />
      )}

      {!isSessionLoading && (
        <ErrorBoundary label="The service filter">
          <section className={styles.providers}>
            <div className={styles.providersHead}>
              <strong>
                {selectedProviderIds.length
                  ? `Showing ${selectedProviderIds.length} service${
                      selectedProviderIds.length === 1 ? "" : "s"
                    }`
                  : "Showing everything"}
              </strong>
              <button type="button" className={styles.providersManage} onClick={onShowSources}>
                Manage services <ArrowIcon />
              </button>
            </div>
            <div
              className={classNames(
                styles.picker,
                selectedProviderIds.length > 0 && styles.filtering,
              )}
            >
              <button
                type="button"
                className={classNames(
                  styles.all,
                  selectedProviderIds.length === 0 && styles.allActive,
                )}
                aria-pressed={selectedProviderIds.length === 0}
                onClick={() => onSelectProviders([])}
              >
                All
              </button>
              {filterableProviders.map((provider) => {
                const isSelected = selectedProviderIds.includes(provider.id);

                return (
                  <button
                    type="button"
                    key={provider.id}
                    className={classNames(styles.provider, isSelected && styles.providerOn)}
                    onClick={() => toggleProvider(provider.id)}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `${provider.name}, showing. Select to stop filtering by it.`
                        : `${provider.name}, not showing. Select to filter by it.`
                    }
                    title={provider.name}
                  >
                    <ProviderBadge provider={provider} className={styles.providerBadge} />
                    <small aria-hidden="true">
                      {selectedProviderIds.length > 0 && isSelected ? "ON" : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            {!filterableProviders.length && (
              <StatusNote tone="warning" live="polite" className={styles.providerError}>
                {providerError ||
                  (providers.length
                    ? "No live provider feeds are configured."
                    : "Loading providers…")}
              </StatusNote>
            )}
          </section>
        </ErrorBoundary>
      )}

      {error && readyFeatured && <Callout className={styles.error}>{error}</Callout>}
      {isBuildingRails && (
        <p className={styles.building} aria-live="polite">
          <i>AI</i> Building your shelves…
        </p>
      )}
      {trending.length > 1 || sections.length > 0 ? (
        <div className={styles.rails}>
          {trending.length > 1 && (
            <ErrorBoundary label="The trending shelf">
              <ContentRail section={trendingSection} ranked onOpen={onOpen} />
            </ErrorBoundary>
          )}
          {episodes.length > 0 && (
            <ErrorBoundary label="Tonight's schedule">
              <section className={styles.schedule}>
                <div className={styles.scheduleHead}>
                  <strong>On tonight</strong>
                  <small>Schedule from TVmaze</small>
                </div>
                <div className={styles.scheduleList}>
                  {episodes.map((episode) => (
                    <button
                      type="button"
                      key={`${episode.showName}-${episode.airsAt}-${episode.episode ?? 0}`}
                      className={styles.scheduleItem}
                      disabled={!episode.item}
                      onClick={() => episode.item && onOpen(episode.item)}
                    >
                      <time dateTime={episode.airsAt}>{formatAirTime(episode.airsAt)}</time>
                      <strong>{episode.showName}</strong>
                      <small>
                        {episode.season && episode.episode
                          ? `S${episode.season}E${episode.episode}`
                          : "New episode"}
                        {episode.episodeName ? ` · ${episode.episodeName}` : ""}
                        {episode.network ? ` · ${episode.network}` : ""}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
            </ErrorBoundary>
          )}
          {sections.map((section) => (
            <ErrorBoundary key={section.id} label={`The ${section.title} shelf`}>
              <ContentRail
                section={section}
                byUsher={isViewerShelfId(section.id)}
                onOpen={onOpen}
                onSeen={isCuratedRailId(section.id) ? onRailSeen : undefined}
                trailing={
                  usherMoment?.id === `rail-feedback:${section.id}` ? (
                    <UsherCard
                      moment={usherMoment}
                      onAction={onUsherAction}
                      onDismiss={onUsherDismiss}
                    />
                  ) : undefined
                }
              />
            </ErrorBoundary>
          ))}
        </div>
      ) : (
        isLoading && (
          <div className={styles.rails} aria-hidden="true">
            {RAIL_SKELETONS.map((rail) => (
              <Rail key={rail}>
                <div className={styles.railSkeletonHead}>
                  <Skeleton shape="eyebrow" />
                  <Skeleton shape="heading" />
                </div>
                <RailTrack>
                  {CARD_SKELETONS.map((card) => (
                    <div key={card}>
                      <Skeleton shape="art" />
                      <Skeleton shape="meta" className={styles.railSkeletonMeta} />
                    </div>
                  ))}
                </RailTrack>
              </Rail>
            ))}
          </div>
        )
      )}
    </>
  );
}

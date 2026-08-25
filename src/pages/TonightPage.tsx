import { useEffect, useMemo, useState } from "react";

import { ContentRail } from "../components/ContentRail";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { TitleArt } from "../components/TitleArt";
import { ArrowIcon, ProviderBadge } from "../components/ui";
import { UsherBanner } from "../components/usher/UsherBanner";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherConsole } from "../components/usher/UsherConsole";
import { UsherHero } from "../components/usher/UsherHero";
import { UsherOnboarding } from "../components/usher/UsherOnboarding";
import { UsherOrder } from "../components/usher/UsherOrder";
import type { CatalogSection, MediaTitle, Provider } from "../domain/catalog";
import type { Guest } from "../domain/notebook";
import type { TonightOrder, UsherMoment } from "../domain/usher";
import type { CuratorState } from "../hooks/useCurator";
import type { ScheduledEpisode } from "../hooks/useTonight";
import type { UsherOrderState, UsherPickState } from "../hooks/useUsher";
import { parseDate } from "../lib/dates";
import { heroTitleClass, mediaMeta, scoreLabel } from "../lib/media";

const IDLE_NUDGE_MS = 40_000;

function formatAirTime(value: string) {
  const airsAt = parseDate(value);

  if (!airsAt) {
    return "";
  }

  const isToday = airsAt.toDateString() === new Date().toDateString();
  const time = airsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

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
  heroSections,
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
  heroSections: CatalogSection[];
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
  onRejectPick: () => void;
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
  const featured = isHeroReady ? heroSections.flatMap((section) => section.items)[0] : undefined;
  const filterableProviders = providers.filter(
    (provider) => provider.status === "feed" && Boolean(provider.tmdbProviderIds?.length),
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
      selectedProviderIds.includes(id)
        ? selectedProviderIds.filter((providerId) => providerId !== id)
        : [...selectedProviderIds, id],
    );
  }

  return (
    <>
      <div className="hero-shell">
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
            <section
              className={`hero-section${featured?.backdropUrl ? "" : " hero-empty"}${
                featured ? "" : " hero-loading"
              }`}
            >
              {featured && (
                <div className="hero-art" aria-hidden="true">
                  <TitleArt
                    url={featured.backdropUrl}
                    seed={featured.id}
                    label={featured.title}
                    width={1280}
                    kind="backdrop"
                    wide
                    eager
                  />
                </div>
              )}
              <div className="hero-gradient" />
              <div className="hero-copy">
                {featured ? (
                  <>
                    <h1 className={heroTitleClass(featured.title)}>{featured.title}</h1>
                    <p className="hero-meta">
                      {mediaMeta(featured)} · {scoreLabel(featured)}
                    </p>
                    <p className="hero-lede">{featured.overview || "No synopsis available."}</p>
                    <div className="hero-actions">
                      <button type="button" className="hero-play" onClick={() => onOpen(featured)}>
                        <span className="play-icon">↗</span> See where to watch
                      </button>
                    </div>
                  </>
                ) : !isHeroReady ? (
                  <div className="hero-skeleton" aria-hidden="true">
                    <span className="skeleton skeleton-title" />
                    <span className="skeleton skeleton-meta" />
                    <span className="skeleton skeleton-line" />
                    <span className="skeleton skeleton-line short" />
                    <span className="skeleton skeleton-button" />
                  </div>
                ) : (
                  <div className="honest-empty" aria-live="polite">
                    <h1>Nothing matched.</h1>
                    <p>{error || "Try another search or change your services."}</p>
                  </div>
                )}
              </div>
            </section>
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
          <section className="provider-strip">
            <div className="provider-strip-heading">
              <div>
                <strong>
                  {selectedProviderIds.length
                    ? `Showing ${selectedProviderIds.length} service${
                        selectedProviderIds.length === 1 ? "" : "s"
                      }`
                    : "Showing everything"}
                </strong>
              </div>
              <button type="button" onClick={onShowSources}>
                Manage services <ArrowIcon />
              </button>
            </div>
            <div className={`provider-picker${selectedProviderIds.length ? " filtering" : ""}`}>
              <button
                type="button"
                className={`provider-filter-all${selectedProviderIds.length ? "" : " active"}`}
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
                    className={isSelected ? "selected" : ""}
                    onClick={() => toggleProvider(provider.id)}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `${provider.name}, showing. Select to stop filtering by it.`
                        : `${provider.name}, not showing. Select to filter by it.`
                    }
                    title={provider.name}
                  >
                    <ProviderBadge provider={provider} />
                    <small aria-hidden="true">
                      {selectedProviderIds.length > 0 && isSelected ? "ON" : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            {!filterableProviders.length && (
              <p className="provider-error" aria-live="polite">
                {providerError ||
                  (providers.length
                    ? "No live provider feeds are configured."
                    : "Loading providers…")}
              </p>
            )}
          </section>
        </ErrorBoundary>
      )}

      {error && featured && (
        <p className="catalogue-error" role="alert">
          {error}
        </p>
      )}
      {isBuildingRails && (
        <p className="rails-building" aria-live="polite">
          <i>AI</i> Building your shelves…
        </p>
      )}
      {trending.length > 1 || sections.length > 0 ? (
        <div className="rails-section">
          {trending.length > 1 && (
            <ErrorBoundary label="The trending shelf">
              <ContentRail section={trendingSection} ranked onOpen={onOpen} />
            </ErrorBoundary>
          )}
          {episodes.length > 0 && (
            <ErrorBoundary label="Tonight's schedule">
              <section className="schedule-strip">
                <div className="schedule-heading">
                  <strong>On tonight</strong>
                  <small>Schedule from TVmaze</small>
                </div>
                <div className="schedule-list">
                  {episodes.map((episode) => (
                    <button
                      type="button"
                      key={`${episode.showName}-${episode.airsAt}-${episode.episode ?? 0}`}
                      className="schedule-item"
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
                byUsher={section.id.startsWith("ai-") || section.id.startsWith("pinned-")}
                onOpen={onOpen}
                onSeen={section.id.startsWith("ai-") ? onRailSeen : undefined}
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
          <div className="rails-section" aria-hidden="true">
            {[0, 1].map((rail) => (
              <div className="content-rail" key={rail}>
                <div className="rail-heading">
                  <div>
                    <span className="skeleton skeleton-eyebrow" />
                    <span className="skeleton skeleton-heading" />
                  </div>
                </div>
                <div className="rail-track">
                  {[0, 1, 2, 3, 4].map((card) => (
                    <div className="rail-card" key={card}>
                      <span className="skeleton skeleton-art" />
                      <span className="skeleton skeleton-meta" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </>
  );
}

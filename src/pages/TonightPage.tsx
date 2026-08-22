import { useEffect, useState } from "react";

import { ArtPlaceholder } from "../components/ArtPlaceholder";
import { ContentRail } from "../components/catalog";
import { ArrowIcon, ProviderBadge } from "../components/ui";
import { UsherBanner } from "../components/usher/UsherBanner";
import { UsherCard } from "../components/usher/UsherCard";
import { UsherConsole } from "../components/usher/UsherConsole";
import { UsherHero } from "../components/usher/UsherHero";
import { UsherOnboarding } from "../components/usher/UsherOnboarding";
import type { CatalogSection, MediaTitle, Provider } from "../domain/catalog";
import type { UsherMoment } from "../domain/usher";
import type { CuratorState } from "../hooks/useCurator";
import type { ScheduledEpisode } from "../hooks/useTonight";
import type { UsherPickState } from "../hooks/useUsher";
import { artwork, artworkSrcSet, heroTitleClass, mediaMeta, scoreLabel } from "../lib/media";

const IDLE_NUDGE_MS = 40_000;

function formatAirTime(value: string) {
  const airsAt = new Date(value);

  if (Number.isNaN(airsAt.getTime())) {
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
  aside,
  onAsk,
  onClearCurator,
  onOpen,
  onPin,
  onPick,
  onRejectPick,
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
  aside: string;
  onAsk: (prompt: string, isRefinement?: boolean) => Promise<void>;
  onClearCurator: () => void;
  onOpen: (item: MediaTitle) => void;
  onPin: () => void;
  onPick: () => void;
  onRejectPick: () => void;
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
    curator.prompt || curatorError || pick.item || pick.isPicking || pick.error || aside,
  );
  const onboardingMoment = usherMoment?.surface === "first-run" ? usherMoment : null;
  const dripMoment = usherMoment?.surface === "home" ? usherMoment : null;

  useEffect(() => {
    if (isUsherMode) {
      return;
    }

    const timer = window.setTimeout(() => setIsIdle(true), IDLE_NUDGE_MS);

    return () => window.clearTimeout(timer);
  }, [isUsherMode]);
  const featured = isHeroReady ? heroSections.flatMap((section) => section.items)[0] : undefined;
  const filterableProviders = providers.filter(
    (provider) =>
      provider.status === "feed" &&
      Boolean(provider.watchmodeSourceIds?.length || provider.tmdbProviderIds?.length),
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
        {onboardingMoment ? (
          <UsherOnboarding
            moment={onboardingMoment}
            providers={filterableProviders}
            onAnswer={onUsherAnswer}
            onSkip={onUsherSkip}
            onDismiss={() => onUsherDismiss("all")}
          />
        ) : (
          <>
            {isUsherMode ? (
              <UsherHero
                curator={curator}
                error={curatorError}
                isAsking={isAsking}
                isPinned={isPinned}
                pick={pick}
                aside={aside}
                onAsk={onAsk}
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
                    {featured.backdropUrl ? (
                      <img
                        src={
                          artwork(featured.backdropUrl, 1280, "backdrop") ?? featured.backdropUrl
                        }
                        srcSet={artworkSrcSet(featured.backdropUrl, 1280, "backdrop")}
                        alt=""
                        decoding="async"
                      />
                    ) : (
                      <ArtPlaceholder seed={featured.id} label={featured.title} wide />
                    )}
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
                        <button
                          type="button"
                          className="hero-play"
                          onClick={() => onOpen(featured)}
                        >
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
          </>
        )}
        {!onboardingMoment && !isUsherMode && (
          <UsherConsole
            isAsking={isAsking}
            isPicking={pick.isPicking}
            isIdle={isIdle}
            hasAsked={isUsherMode}
            onAsk={(value) => void onAsk(value)}
            onPick={onPick}
          />
        )}
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
                  title={provider.name}
                >
                  <ProviderBadge provider={provider} />
                  {selectedProviderIds.length > 0 && <small>{isSelected ? "ON" : ""}</small>}
                </button>
              );
            })}
            {!filterableProviders.length && (
              <p className="provider-error">
                {providerError ||
                  (providers.length
                    ? "No live provider feeds are configured."
                    : "Loading providers…")}
              </p>
            )}
          </div>
        </section>
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
            <ContentRail
              section={{
                id: "trending",
                title: "Trending now",
                description: "Wikipedia readers this week against last",
                items: trending,
              }}
              ranked
              onOpen={onOpen}
            />
          )}
          {episodes.length > 0 && (
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
          )}
          {sections.map((section) => (
            <ContentRail
              key={section.id}
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

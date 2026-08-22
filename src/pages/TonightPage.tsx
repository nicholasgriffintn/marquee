import { useState } from "react";

import { ArtPlaceholder } from "../components/ArtPlaceholder";
import { ContentRail } from "../components/catalog";
import { ArrowIcon, ProviderBadge } from "../components/ui";
import type { CatalogSection, MediaTitle, Provider } from "../domain/catalog";
import type { CuratorState } from "../hooks/useCurator";
import type { ScheduledEpisode } from "../hooks/useTonight";
import { artwork, artworkSrcSet, mediaMeta, scoreLabel } from "../lib/media";

const SEED_PROMPTS = [
  "Something short and funny",
  "A slow burn for a rainy night",
  "Smart sci-fi I have not seen",
  "Watch with my kids",
];

const REFINEMENTS = ["Shorter", "Lighter", "Older", "Weirder", "More acclaimed"];

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
  isSignedIn,
  sections,
  episodes,
  trending,
  providers,
  selectedProviderIds,
  onAsk,
  onClearCurator,
  onOpen,
  onSelectProviders,
  onShowSources,
}: {
  curator: CuratorState;
  curatorError: string;
  isAsking: boolean;
  isLoading: boolean;
  isBuildingRails: boolean;
  isSessionLoading: boolean;
  error: string;
  providerError: string;
  isSignedIn: boolean;
  sections: CatalogSection[];
  episodes: ScheduledEpisode[];
  trending: MediaTitle[];
  providers: Provider[];
  selectedProviderIds: string[];
  onAsk: (prompt: string, isRefinement?: boolean) => Promise<void>;
  onClearCurator: () => void;
  onOpen: (item: MediaTitle) => void;
  onSelectProviders: (ids: string[]) => void;
  onShowSources: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const featured = sections.flatMap((section) => section.items)[0];
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
      <section
        className={`hero-section${featured?.backdropUrl ? "" : " hero-empty"}${
          !featured && isLoading ? " hero-loading" : ""
        }`}
      >
        {featured && (
          <div className="hero-art" aria-hidden="true">
            {featured.backdropUrl ? (
              <img
                src={artwork(featured.backdropUrl, 1280, "backdrop") ?? featured.backdropUrl}
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
              <h1>{featured.title}</h1>
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
          ) : isLoading ? (
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
        {isSignedIn && (
          <div className="curator-console">
            <form
              className="curator-dock"
              onSubmit={(event) => {
                event.preventDefault();
                void onAsk(prompt);
              }}
            >
              <span>
                <i>AI</i> Ask Marquee
              </span>
              <input
                maxLength={1_000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="90 mins, clever but not bleak…"
                aria-label="Ask Marquee for recommendations"
              />
              <button
                type="submit"
                disabled={isAsking || !prompt.trim() || !featured}
                aria-label="Ask Marquee"
              >
                {isAsking ? "…" : <ArrowIcon />}
              </button>
            </form>
            {!curator.prompt && (
              <div className="curator-seeds">
                {SEED_PROMPTS.map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => {
                      setPrompt(seed);
                      void onAsk(seed);
                    }}
                  >
                    {seed}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {isSignedIn && (curator.prompt || curatorError) && (
        <div
          className={`curator-response${curatorError ? " curator-error" : ""}`}
          aria-live="polite"
        >
          <span>
            {curatorError ? "COULDN’T MAKE A SELECTION" : "MARQUEE CURATOR"}
            {curator.status && <em className="curator-status">{curator.status}…</em>}
          </span>
          <p>
            {curatorError || curator.summary}
            {curator.isStreaming && !curatorError && <i className="curator-caret" />}
          </p>
          {curator.items.length > 0 && !curator.isStreaming && (
            <div className="curator-refine">
              <span>Refine</span>
              {REFINEMENTS.map((refinement) => (
                <button
                  key={refinement}
                  type="button"
                  disabled={isAsking}
                  onClick={() => void onAsk(refinement, true)}
                >
                  {refinement}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="curator-clear" onClick={onClearCurator}>
            Clear
          </button>
        </div>
      )}

      {isSignedIn && !isSessionLoading && (
        <section className="provider-strip">
          <div className="provider-strip-heading">
            <div>
              <strong>Your services · {selectedProviderIds.length || "all"} active</strong>
            </div>
            <button type="button" onClick={onShowSources}>
              Manage all {providers.length} <ArrowIcon />
            </button>
          </div>
          <div className="provider-picker">
            {filterableProviders.map((provider) => {
              const isSelected = selectedProviderIds.includes(provider.id);

              return (
                <button
                  type="button"
                  key={provider.id}
                  className={isSelected ? "selected" : ""}
                  onClick={() => toggleProvider(provider.id)}
                  aria-pressed={isSelected}
                >
                  <ProviderBadge provider={provider} />
                  <small>{isSelected ? "ON" : "OFF"}</small>
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

      {episodes.length > 0 && (
        <section className="schedule-strip">
          <div className="schedule-heading">
            <strong>On tonight</strong>
            <small>Air times from TVmaze</small>
          </div>
          <div className="schedule-list">
            {episodes.slice(0, 8).map((episode) => (
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

      {trending.length > 1 && (
        <div className="rails-section">
          <ContentRail
            section={{
              id: "trending",
              title: "Trending now",
              description: "Ranked by how fast Wikipedia readers are arriving",
              items: trending,
            }}
            onOpen={onOpen}
          />
        </div>
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
      {sections.length > 0 ? (
        <div className="rails-section">
          {sections.map((section) => (
            <ContentRail key={section.id} section={section} onOpen={onOpen} />
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

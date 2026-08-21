import { useState } from "react";

import { ContentRail } from "../components/catalog";
import { ArrowIcon, ProviderBadge } from "../components/ui";
import type { CatalogSection, MediaTitle, Provider } from "../domain/catalog";
import { mediaMeta, scoreLabel } from "../lib/media";
import type { CuratorResponse } from "../types";

export function TonightPage({
  curator,
  curatorError,
  isAsking,
  isLoading,
  error,
  providerError,
  isSignedIn,
  sections,
  providers,
  selectedProviderIds,
  onAsk,
  onClearCurator,
  onOpen,
  onSelectProviders,
  onShowSources,
}: {
  curator: CuratorResponse | null;
  curatorError: string;
  isAsking: boolean;
  isLoading: boolean;
  error: string;
  providerError: string;
  isSignedIn: boolean;
  sections: CatalogSection[];
  providers: Provider[];
  selectedProviderIds: string[];
  onAsk: (prompt: string) => Promise<void>;
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
        {featured?.backdropUrl && (
          <div className="hero-art" aria-hidden="true">
            <img src={featured.backdropUrl} alt="" />
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
        )}
      </section>

      {isSignedIn && (curator || curatorError) && (
        <div
          className={`curator-response${curatorError ? " curator-error" : ""}`}
          aria-live="polite"
        >
          <span>{curator ? "MARQUEE CURATOR" : "COULDN’T MAKE A SELECTION"}</span>
          <p>{curator ? curator.summary : curatorError}</p>
          <button type="button" onClick={onClearCurator}>
            Clear
          </button>
        </div>
      )}

      {isSignedIn && (
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

      {error && featured && (
        <p className="catalogue-error" role="alert">
          {error}
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

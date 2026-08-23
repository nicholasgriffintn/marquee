import { useState } from "react";

import { ProviderBadge } from "../components/ui";
import type { Provider, ProvidersResponse } from "../domain/catalog";
import type { ProviderCategory } from "../domain/providers";
import { useLinks } from "../hooks/useLinks";

const TMDB_LOGO =
  "https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg";
const CATEGORIES: Array<{ id: string; name: ProviderCategory }> = [
  { id: "subscription", name: "Subscription" },
  { id: "broadcaster", name: "Broadcaster" },
  { id: "free", name: "Free" },
  { id: "cinema", name: "Cinema" },
  { id: "specialist", name: "Specialist" },
  { id: "sport", name: "Sport" },
  { id: "rent-or-buy", name: "Rent or buy" },
  { id: "additional-coverage", name: "Additional coverage" },
];

function hasLiveFeed(provider: Provider) {
  return (
    provider.status === "feed" &&
    Boolean(provider.watchmodeSourceIds?.length || provider.tmdbProviderIds?.length)
  );
}

export function SourcesPage({
  providers,
  providerError,
  stats,
  isSignedIn,
  selectedProviderIds,
  onSelectProviders,
}: {
  providers: Provider[];
  providerError: string;
  stats: ProvidersResponse["stats"];
  isSignedIn: boolean;
  selectedProviderIds: string[];
  onSelectProviders: (ids: string[]) => void;
}) {
  const connections = useLinks(isSignedIn);
  const [tokenLabel, setTokenLabel] = useState("");
  const trakt = connections.links.find((link) => link.provider === "trakt");

  function toggleProvider(id: string) {
    onSelectProviders(
      selectedProviderIds.includes(id)
        ? selectedProviderIds.filter((providerId) => providerId !== id)
        : [...selectedProviderIds, id],
    );
  }

  return (
    <section className="page-section sources-page">
      <div className="page-title-row">
        <div>
          <h1>
            Services, and <em>where the data comes from.</em>
          </h1>
        </div>

        <p>
          JustWatch provides availability and deep links, with TMDB covering the service directory
          and Watchmode filling gaps on saved titles. Services without a feed still link out, so you
          can see what’s missing.
        </p>
      </div>
      {isSignedIn && (
        <section className="panel-block" aria-labelledby="connections-title">
          <h2 id="connections-title">Connected accounts</h2>
          <div className="connection-row">
            <strong>Trakt</strong>
            {trakt?.available === false ? (
              <small>Not configured on this deployment.</small>
            ) : trakt?.connected ? (
              <>
                <small>
                  {trakt.account ? `Linked as ${trakt.account}` : "Linked"}
                  {trakt.syncedAt
                    ? ` · synced ${new Date(trakt.syncedAt).toLocaleDateString()}`
                    : ""}
                </small>
                <span className="spacer" />
                <button type="button" onClick={() => void connections.syncTrakt()}>
                  Sync now
                </button>
                <button type="button" onClick={() => void connections.unlinkTrakt()}>
                  Unlink
                </button>
              </>
            ) : (
              <>
                <small>Import your watch history, ratings and watchlist.</small>
                <span className="spacer" />
                <a
                  className="link-button link-button-primary"
                  href="/api/links/trakt/start?returnTo=/sources"
                >
                  Connect Trakt
                </a>
              </>
            )}
          </div>

          <div className="connection-row">
            <strong>API tokens</strong>
            <small>Connect Marquee to an agent over MCP at /mcp.</small>
            <span className="spacer" />
            <input
              className="token-field"
              value={tokenLabel}
              maxLength={60}
              placeholder="Token name, e.g. Claude"
              aria-label="Token name"
              onChange={(event) => setTokenLabel(event.target.value)}
            />
            <button
              type="button"
              className="link-button-primary"
              onClick={() => {
                void connections.createToken(tokenLabel);
                setTokenLabel("");
              }}
            >
              Create
            </button>
          </div>
          {connections.freshToken && (
            <div className="connection-row">
              <strong>Copy it now</strong>
              <code className="token-value">{connections.freshToken}</code>
              <span className="spacer" />
              <button type="button" onClick={connections.dismissToken}>
                Done
              </button>
            </div>
          )}
          {connections.tokens.length > 0 && (
            <ul className="token-list">
              {connections.tokens.map((token) => (
                <li key={token.id}>
                  <strong>{token.label}</strong>
                  <small>
                    {token.lastUsedAt
                      ? `used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                      : "never used"}
                  </small>
                  <span className="spacer" />
                  <button type="button" onClick={() => void connections.revokeToken(token.id)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          {connections.error && (
            <div className="connection-row">
              <p>{connections.error}</p>
            </div>
          )}
        </section>
      )}
      <div className="source-summary">
        <div>
          <strong>{stats.configured}</strong>
          <span>services listed</span>
        </div>
        <div>
          <strong>{stats.feeds}</strong>
          <span>with availability data</span>
        </div>
        <div>
          <strong>{stats.links}</strong>
          <span>link out only</span>
        </div>
        <div>
          <strong>{stats.markers}</strong>
          <span>listed, no data yet</span>
        </div>
      </div>
      {providerError && (
        <p className="catalogue-error" role="alert">
          {providerError}
        </p>
      )}
      <div className="source-list" aria-label="Streaming providers">
        {CATEGORIES.map((category) => {
          const categoryProviders = providers.filter(
            (provider) => provider.category === category.name,
          );

          if (!categoryProviders.length) {
            return null;
          }

          return (
            <section
              className="source-group"
              key={category.id}
              aria-labelledby={`source-category-${category.id}`}
            >
              <h2 id={`source-category-${category.id}`}>{category.name}</h2>
              {categoryProviders.map((provider) => {
                const isSelected = selectedProviderIds.includes(provider.id);
                const isLive = hasLiveFeed(provider);

                return (
                  <div className={`source-row${isSelected ? " selected" : ""}`} key={provider.id}>
                    <ProviderBadge provider={provider} />
                    <div className="source-name">
                      <strong>{provider.name}</strong>
                      <span>{provider.sourceLabel}</span>
                    </div>
                    <span className={`source-status source-status-${provider.status}`}>
                      {provider.status === "marker" ? "TBD" : provider.status.toUpperCase()}
                    </span>
                    {provider.status === "feed" && (
                      <button
                        type="button"
                        disabled={!isLive}
                        aria-pressed={isSelected}
                        aria-label={`${provider.name}${isSelected ? ", selected" : ""}`}
                        onClick={() => toggleProvider(provider.id)}
                      >
                        {isLive ? (isSelected ? "Included" : "Add") : "Unavailable"}
                      </button>
                    )}
                    {provider.status === "link" && provider.homepage && (
                      <a href={provider.homepage} target="_blank" rel="noreferrer">
                        Open ↗
                      </a>
                    )}
                    {provider.status === "marker" && (
                      <span className="source-marker-action">—</span>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <section className="source-attribution" aria-labelledby="source-attribution-title">
        <h2 id="source-attribution-title">Where this comes from</h2>
        <div className="source-credits">
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            <img className="tmdb-logo" src={TMDB_LOGO} alt="The Movie Database (TMDB)" />
            <span>Titles, artwork and metadata</span>
          </a>
          <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">
            <strong>JustWatch</strong>
            <span>Availability and deep links</span>
          </a>
          <a href="https://www.watchmode.com" target="_blank" rel="noreferrer">
            <strong>Watchmode</strong>
            <span>Service directory and gap filling</span>
          </a>
          <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">
            <strong>TVmaze</strong>
            <span>Air dates and episode schedules</span>
          </a>
          <a href="https://anilist.co" target="_blank" rel="noreferrer">
            <strong>AniList</strong>
            <span>Anime tags and airing episodes</span>
          </a>
          <a href="https://wikimediafoundation.org" target="_blank" rel="noreferrer">
            <strong>Wikimedia</strong>
            <span>Pageview trends behind Trending</span>
          </a>
          <a href="https://trakt.tv" target="_blank" rel="noreferrer">
            <strong>Trakt</strong>
            <span>Your imported watch history</span>
          </a>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            <strong>OpenStreetMap</strong>
            <span>Where the cinemas actually are</span>
          </a>
        </div>
        <p>
          Cinema listings are published by the chains themselves — Cineworld, Picturehouse and Vue —
          and are read as they are given. Where a chain publishes days but not times, you get days.
          Cinema locations come from OpenStreetMap contributors, licensed under the{" "}
          <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">
            ODbL
          </a>
          .
        </p>
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Listings change,
          so check the service itself before you settle in.
        </p>
      </section>
    </section>
  );
}

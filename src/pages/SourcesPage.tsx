import { ProviderBadge } from "../components/ui";
import type { Provider, ProvidersResponse } from "../domain/catalog";
import type { ProviderCategory } from "../domain/providers";

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
          Watchmode provides availability and deep links. TMDB and JustWatch cover the rest.
          Services without a feed still link out, so you can see what’s missing.
        </p>
      </div>
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
      <div
        className={`source-list${isSignedIn ? "" : " source-list-public"}`}
        aria-label="Streaming providers"
      >
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
                    {isSignedIn && provider.status === "feed" && (
                      <button
                        type="button"
                        disabled={!isLive}
                        aria-pressed={isSelected}
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
          <a href="https://www.watchmode.com" target="_blank" rel="noreferrer">
            <strong>Watchmode</strong>
            <span>Availability and deep links</span>
          </a>
          <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">
            <strong>JustWatch</strong>
            <span>Availability via TMDB</span>
          </a>
        </div>
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Listings change,
          so check the service itself before you settle in.
        </p>
      </section>
    </section>
  );
}

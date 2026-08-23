import { useState } from "react";

import type { Provider, ProvidersResponse } from "../../domain/catalog";
import type { ProviderCategory } from "../../domain/providers";
import { ProviderBadge } from "../ui";

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

const OPEN_BY_DEFAULT = new Set(["subscription", "broadcaster"]);

function hasLiveFeed(provider: Provider) {
  return (
    provider.status === "feed" &&
    Boolean(provider.watchmodeSourceIds?.length || provider.tmdbProviderIds?.length)
  );
}

export function ServicesPanel({
  providers,
  providerError,
  stats,
  selectedProviderIds,
  onSelectProviders,
}: {
  providers: Provider[];
  providerError: string;
  stats: ProvidersResponse["stats"];
  selectedProviderIds: string[];
  onSelectProviders: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [minesOnly, setMinesOnly] = useState(false);

  const term = query.trim().toLowerCase();
  const forced = Boolean(term) || minesOnly;
  const chosen = providers.filter((provider) => selectedProviderIds.includes(provider.id));

  function toggleProvider(id: string) {
    onSelectProviders(
      selectedProviderIds.includes(id)
        ? selectedProviderIds.filter((providerId) => providerId !== id)
        : [...selectedProviderIds, id],
    );
  }

  function matches(provider: Provider) {
    if (minesOnly && !selectedProviderIds.includes(provider.id)) {
      return false;
    }

    return !term || provider.name.toLowerCase().includes(term);
  }

  const groups = CATEGORIES.map((category) => ({
    ...category,
    all: providers.filter((provider) => provider.category === category.name),
    shown: providers.filter((provider) => provider.category === category.name && matches(provider)),
  })).filter((group) => group.all.length > 0);
  const total = groups.reduce((count, group) => count + group.shown.length, 0);

  return (
    <>
      <div className="services-summary">
        <p>
          <strong>{selectedProviderIds.length || "No"}</strong>
          <span>
            {selectedProviderIds.length === 1 ? "service you pay for" : "services you pay for"}
          </span>
        </p>
        {chosen.length > 0 ? (
          <ul className="services-chosen">
            {chosen.map((provider) => (
              <li key={provider.id}>
                <ProviderBadge provider={provider} compact />
                <span>{provider.name}</span>
                <button
                  type="button"
                  aria-label={`Stop including ${provider.name}`}
                  onClick={() => toggleProvider(provider.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="services-none">
            Nothing ticked, so I assume everything. Tick a few and I will stop offering you things
            behind doors you cannot open.
          </p>
        )}
      </div>

      <div className="services-controls">
        <input
          type="search"
          value={query}
          maxLength={40}
          placeholder="Find a service…"
          aria-label="Find a service"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="services-mine">
          <input
            type="checkbox"
            checked={minesOnly}
            onChange={(event) => setMinesOnly(event.target.checked)}
          />
          Only mine
        </label>
        <small>
          {total} of {stats.configured} listed
        </small>
      </div>

      {providerError && (
        <p className="catalogue-error" role="alert">
          {providerError}
        </p>
      )}

      <div className="source-list" aria-label="Streaming providers">
        {groups.map((group) => {
          const picked = group.all.filter((provider) =>
            selectedProviderIds.includes(provider.id),
          ).length;
          const isOpen = forced
            ? group.shown.length > 0
            : (opened[group.id] ?? OPEN_BY_DEFAULT.has(group.id));

          if (group.shown.length === 0) {
            return null;
          }

          return (
            <details
              className="source-group"
              key={group.id}
              open={isOpen}
              onToggle={(event) => {
                const isNowOpen = event.currentTarget.open;

                if (!forced) {
                  setOpened((current) => ({ ...current, [group.id]: isNowOpen }));
                }
              }}
            >
              <summary>
                <span className="source-group-name">{group.name}</span>
                <small>
                  {group.shown.length}
                  {picked > 0 ? ` · ${picked} yours` : ""}
                </small>
              </summary>

              {group.shown.map((provider) => {
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
            </details>
          );
        })}
      </div>

      {total === 0 && (
        <p className="notebook-empty">
          Nothing by that name. The list is only as good as what publishes a feed.
        </p>
      )}
    </>
  );
}

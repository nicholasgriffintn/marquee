import { useState } from "react";

import type { Provider, ProvidersResponse } from "../../domain/catalog";
import type { ProviderCategory, ProviderState } from "../../domain/providers";
import { classNames } from "../../lib/class-names";
import { Callout, CloseIcon, ExternalLinkIcon, MinusIcon, PlusIcon } from "../../ui";
import { ProviderBadge } from "../ProviderBadge";
import { SourceStatus } from "../sources/SourceStatus";
import { NotebookEmpty } from "./NotebookSection";

import styles from "./ServicesPanel.module.css";

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

const STATE_LABELS: Record<ProviderState, string> = {
  live: "LIVE",
  stale: "LAST KNOWN",
  unresolved: "NO MATCH",
  "out-of-scope": "LIVE EVENTS",
  failed: "NOT ANSWERING",
};

function canSelect(provider: Provider) {
  return provider.capabilities.includes("preference");
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

  // oxlint-disable-next-line no-map-spread -- CATEGORIES is a fixed 8-item list, spread is the clearest form here
  const groups = CATEGORIES.map((category) => ({
    ...category,
    all: providers.filter((provider) => provider.category === category.name),
    shown: providers.filter((provider) => provider.category === category.name && matches(provider)),
  })).filter((group) => group.all.length > 0);
  const total = groups.reduce((count, group) => count + group.shown.length, 0);

  return (
    <>
      <div className={styles.summary}>
        <p className={styles.count}>
          <strong>{selectedProviderIds.length || "No"}</strong>
          <span>
            {selectedProviderIds.length === 1 ? "service you pay for" : "services you pay for"}
          </span>
        </p>
        {chosen.length > 0 ? (
          <ul className={styles.chosen}>
            {chosen.map((provider) => (
              <li key={provider.id}>
                <ProviderBadge provider={provider} compact />
                <span>{provider.name}</span>
                <button
                  type="button"
                  aria-label={`Stop including ${provider.name}`}
                  onClick={() => toggleProvider(provider.id)}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.none}>
            Nothing ticked, so I assume everything. Tick a few and I will stop offering you things
            behind doors you cannot open.
          </p>
        )}
      </div>

      <div className={styles.controls}>
        <input
          className={styles.search}
          type="search"
          value={query}
          maxLength={40}
          placeholder="Find a service…"
          aria-label="Find a service"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className={styles.mine}>
          <input
            type="checkbox"
            checked={minesOnly}
            onChange={(event) => setMinesOnly(event.target.checked)}
          />
          Only mine
        </label>
        <small className={styles.tally}>
          {total} of {stats.configured} listed
        </small>
      </div>

      {providerError && <Callout>{providerError}</Callout>}

      <div className={styles.list} aria-label="Streaming providers">
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
              className={styles.group}
              key={group.id}
              open={isOpen}
              onToggle={(event) => {
                const isNowOpen = event.currentTarget.open;

                if (!forced) {
                  setOpened((current) => ({
                    ...current,
                    [group.id]: isNowOpen,
                  }));
                }
              }}
            >
              <summary className={styles.groupSummary}>
                <span className={styles.toggle} aria-hidden="true">
                  <PlusIcon className={styles.plus} />
                  <MinusIcon className={styles.minus} />
                </span>
                <span className={styles.groupName}>{group.name}</span>
                <small>
                  {group.shown.length}
                  {picked > 0 ? ` · ${picked} yours` : ""}
                </small>
              </summary>

              {group.shown.map((provider) => {
                const isSelected = selectedProviderIds.includes(provider.id);
                const selectable = canSelect(provider);

                return (
                  <div
                    className={classNames(styles.row, isSelected && styles.selected)}
                    key={provider.id}
                  >
                    <ProviderBadge provider={provider} className={styles.badge} />
                    <div className={styles.name}>
                      <strong>{provider.name}</strong>
                      <span>
                        {provider.titles > 0
                          ? `${provider.titles.toLocaleString()} titles · ${provider.sourceLabel}`
                          : provider.sourceLabel}
                      </span>
                    </div>
                    <SourceStatus state={provider.state}>
                      {STATE_LABELS[provider.state]}
                    </SourceStatus>
                    {selectable ? (
                      <button
                        type="button"
                        className={styles.action}
                        aria-pressed={isSelected}
                        aria-label={`${provider.name}${isSelected ? ", selected" : ""}`}
                        onClick={() => toggleProvider(provider.id)}
                      >
                        {isSelected ? "Included" : "Add"}
                      </button>
                    ) : provider.homepage ? (
                      <a
                        className={styles.action}
                        href={provider.homepage}
                        target="_blank"
                        rel="noreferrer"
                        title={provider.reason ?? undefined}
                      >
                        Open <ExternalLinkIcon />
                      </a>
                    ) : (
                      <span className={styles.markerAction} title={provider.reason ?? undefined}>
                        —
                      </span>
                    )}
                  </div>
                );
              })}
            </details>
          );
        })}
      </div>

      {total === 0 && (
        <NotebookEmpty>
          Nothing by that name. The list is only as good as what publishes a feed.
        </NotebookEmpty>
      )}
    </>
  );
}

import { useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminOverview, AdminProviders } from "../../hooks/useAdmin";
import { useResource } from "../../hooks/useResource";
import { parseDatabaseDate } from "../../lib/dates";
import { Callout, Panel, Stat, StatGrid, TabPanel } from "../../ui";
import { SampleModal } from "./SampleModal";
import { UpstreamPanel } from "./UpstreamPanel";

import panelStyles from "./admin.module.css";

const PROVIDER_STATE_COPY: Record<AdminProviders["providers"][number]["state"], string> = {
  live: "live",
  stale: "last known",
  unresolved: "no match",
  "out-of-scope": "live events, not a catalogue",
  failed: "not answering",
};

const PROVIDER_FILTERS = ["all", "live", "stale", "unresolved", "out-of-scope", "failed"] as const;

type ProviderFilter = (typeof PROVIDER_FILTERS)[number];

function stamp(value: string | null) {
  return value ? (parseDatabaseDate(value)?.toLocaleString() ?? "never") : "never";
}

export function SourcesTab({
  overview,
  revision,
  onResume,
}: {
  overview: AdminOverview | null;
  revision: number;
  onResume: (source: string) => void;
}) {
  const [sample, setSample] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProviderFilter>("all");
  const { data: ledger, error } = useResource<AdminProviders>("/api/admin/providers", {
    errorMessage: "Could not read the provider ledger.",
    refreshKey: String(revision),
  });
  const providers = (ledger?.providers ?? []).filter(
    (provider) => filter === "all" || provider.state === filter,
  );

  return (
    <ErrorBoundary label="The sources">
      <TabPanel id="sources" idPrefix="admin">
        {error && <Callout>{error}</Callout>}

        {overview && overview.sources.length > 0 && (
          <UpstreamPanel sources={overview.sources} onSample={setSample} onResume={onResume} />
        )}

        {ledger?.stats && (
          <Panel heading="Service directory">
            <p className={panelStyles.note}>
              Registry entries against what the last sweep resolved. A service counts as live only
              once it has an upstream match or titles attached to it — configuration on its own
              proves nothing. Read {stamp(ledger.fetchedAt)}.
            </p>
            <StatGrid min="130px">
              <Stat value={ledger.stats.configured.toLocaleString()} label="services listed" />
              <Stat value={ledger.stats.live.toLocaleString()} label="live" />
              <Stat value={ledger.stats.stale.toLocaleString()} label="last known only" />
              <Stat value={ledger.stats.unresolved.toLocaleString()} label="nothing matched" />
              <Stat value={ledger.stats.outOfScope.toLocaleString()} label="live events" />
              <Stat value={ledger.stats.failed.toLocaleString()} label="not answering" />
              <Stat value={ledger.stats.longTail.toLocaleString()} label="long tail" />
              <Stat
                value={ledger.stats.titlesCovered.toLocaleString()}
                label="offers on listed services"
              />
            </StatGrid>
            {ledger.errors.length > 0 && (
              <ul className={panelStyles.failures}>
                {ledger.errors.map((entry) => (
                  <li key={`${entry.source}:${entry.detail}`}>
                    <strong>{entry.source}</strong>
                    <small>{entry.detail}</small>
                  </li>
                ))}
              </ul>
            )}
            <div className={panelStyles.filters}>
              {PROVIDER_FILTERS.map((state) => (
                <button
                  key={state}
                  type="button"
                  className={panelStyles.budgetAction}
                  aria-pressed={filter === state}
                  onClick={() => setFilter(state)}
                >
                  {state}
                  <em>
                    {state === "all"
                      ? (ledger.providers.length ?? 0)
                      : ledger.providers.filter((provider) => provider.state === state).length}
                  </em>
                </button>
              ))}
            </div>
            <ul className={panelStyles.list}>
              {providers.map((provider) => (
                <li key={provider.id}>
                  <strong>{provider.name}</strong>
                  <small>{provider.category}</small>
                  <small>{PROVIDER_STATE_COPY[provider.state]}</small>
                  <small>{provider.capabilities.join(" · ")}</small>
                  <span className={panelStyles.spacer} />
                  {provider.titles > 0 && <code>{provider.titles.toLocaleString()} titles</code>}
                  {provider.tmdbProviderIds.length > 0 && (
                    <code>tmdb {provider.tmdbProviderIds.join(", ")}</code>
                  )}
                  {provider.reason && <small>{provider.reason}</small>}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {ledger && ledger.unmapped.length > 0 && (
          <Panel heading="Offers with no home">
            <p className={panelStyles.note}>
              Availability the sweep wrote against a JustWatch package that matched no entry in the
              directory. Rows marked <em>stale</em> already match a registry entry and will reattach
              the next time those titles are enriched. The rest are services the directory does not
              list; they need an entry or an alias.
            </p>
            <ul className={panelStyles.list}>
              {ledger.unmapped.map((offer) => (
                <li key={offer.providerId}>
                  <strong>{offer.name}</strong>
                  <small>{offer.providerId}</small>
                  {offer.resolvesNow && <small>stale · now maps to {offer.resolvesNow}</small>}
                  <span className={panelStyles.spacer} />
                  <code>{offer.titles.toLocaleString()} titles</code>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </TabPanel>
      {sample && (
        <SampleModal
          type="budget"
          itemKey={sample}
          label={sample}
          onClose={() => setSample(null)}
        />
      )}
    </ErrorBoundary>
  );
}

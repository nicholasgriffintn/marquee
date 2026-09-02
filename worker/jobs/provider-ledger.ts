import type { Provider, ProviderLedgerError, ProvidersResponse } from "../../src/domain/catalog.ts";
import {
  canonicalProviderName,
  findRegistryProvider,
  findRegistryProviderForOffer,
  providerRegistry,
  PROVIDER_LEDGER_VERSION,
  PROVIDER_SOURCE_LABEL,
  type ProviderCapability,
  type ProviderCatalogue,
  type ProviderState,
} from "../../src/domain/providers.ts";
import { getTmdbProviders } from "../clients/tmdb.ts";
import { errorMessage } from "../lib/logging.ts";
import { readProviders } from "../repositories/providers.ts";
import type { Bindings } from "../types.ts";

type Resolution = {
  tmdbProviderIds: number[];
  titles: number;
};

type Coverage = { titles: number; fresh: number };

const COVERAGE_FRESH_DAYS = 45;

const LONG_TAIL_PREFIX = "tmdb:";

function tidyName(name: string) {
  return name.replace(/\s+/gu, " ").trim();
}

function dynamicMark(name: string) {
  return name
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function isLongTail(provider: Provider) {
  return provider.id.startsWith(LONG_TAIL_PREFIX);
}

function addSourceId(ids: number[], id: number) {
  if (!ids.includes(id)) {
    ids.push(id);
  }
}

function preferName(provider: Provider, name: string) {
  if (name.length < provider.name.length) {
    provider.name = name;
    provider.mark = dynamicMark(name);
  }
}

function capabilitiesOf(provider: Provider, state: ProviderState): ProviderCapability[] {
  const capabilities: ProviderCapability[] = ["directory"];

  if (state === "live" || state === "stale") {
    capabilities.push("availability", "preference");
  }

  if (provider.homepage) {
    capabilities.push("watch");
  }

  return capabilities;
}

function stateOf(
  resolved: boolean,
  coverage: Coverage,
  knownBefore: boolean,
  sourceFailed: boolean,
  catalogue: ProviderCatalogue,
): ProviderState {
  if (sourceFailed) {
    if (resolved || coverage.titles > 0 || knownBefore) {
      return "stale";
    }

    return catalogue === "live-events" ? "out-of-scope" : "failed";
  }

  if (resolved || coverage.fresh > 0) {
    return "live";
  }

  if (coverage.titles > 0) {
    return "stale";
  }

  return catalogue === "live-events" ? "out-of-scope" : "unresolved";
}

function reasonFor(provider: Provider, state: ProviderState, note: string | null) {
  if (state === "live" || state === "out-of-scope") {
    return note;
  }

  if (state === "failed") {
    return `${provider.sourceLabel} did not answer on the last sweep and there is nothing older to fall back on.`;
  }

  if (state === "stale") {
    return `${provider.sourceLabel} did not answer on the last sweep, so this is the last good reading.`;
  }

  return (
    note ??
    `Nothing on ${provider.sourceLabel} has matched this service yet, so there are no titles to attach to it.`
  );
}

function baseProviders(): Provider[] {
  return providerRegistry.map((configured, index) => ({
    id: configured.id,
    mark: configured.mark,
    name: configured.name,
    category: configured.category,
    sourceLabel: PROVIDER_SOURCE_LABEL,
    capabilities: ["directory"],
    state: "unresolved",
    reason: configured.note,
    displayPriority: index,
    homepage: configured.homepage,
    tmdbProviderIds: [],
    titles: 0,
  }));
}

function indexProviders(byId: Map<string, Provider>) {
  const byCanonicalName = new Map<string, Provider>();

  for (const configured of providerRegistry) {
    const provider = byId.get(configured.id);

    if (!provider) {
      continue;
    }

    for (const alias of configured.aliases) {
      const canonical = canonicalProviderName(alias);

      if (canonical && !byCanonicalName.has(canonical)) {
        byCanonicalName.set(canonical, provider);
      }
    }
  }

  return byCanonicalName;
}

async function readCoverage(db: Database) {
  const result = await db.query<{ providerId: string; titles: number; fresh: number }>(
    `SELECT p.provider_id AS "providerId",
            count(*) AS titles,
            count(*) FILTER (
              WHERE t.enriched_at > (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))
            ) AS fresh
       FROM catalog_title_providers AS p
       JOIN catalog_titles AS t ON t.id = p.title_id
      GROUP BY p.provider_id`,
    [`-${COVERAGE_FRESH_DAYS} days`],
  );

  return new Map<string, Coverage>(
    result.rows.map((row) => [row.providerId, { titles: row.titles, fresh: row.fresh }]),
  );
}

function previousResolution(previous: ProvidersResponse | null) {
  const known = new Map<string, Resolution>();

  for (const provider of previous?.providers ?? []) {
    known.set(provider.id, {
      tmdbProviderIds: provider.tmdbProviderIds,
      titles: provider.titles,
    });
  }

  return known;
}

function mergeProviderLedger(
  tmdbSources: Awaited<ReturnType<typeof getTmdbProviders>>,
  coverage: Map<string, Coverage>,
  previous: ProvidersResponse | null,
  errors: ProviderLedgerError[],
): ProvidersResponse {
  const directoryFailed = errors.some((error) => error.source === "TMDB");
  const known = previousResolution(previous);
  const providers = baseProviders();
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const byCanonicalName = indexProviders(byId);

  for (const source of tmdbSources) {
    const name = tidyName(source.name);
    const registry = findRegistryProvider(name) ?? findRegistryProviderForOffer(name, "other");
    const canonical = canonicalProviderName(name);
    const existing = registry ? byId.get(registry.id) : byCanonicalName.get(canonical);

    if (existing) {
      addSourceId(existing.tmdbProviderIds, source.id);

      if (isLongTail(existing)) {
        preferName(existing, name);
      }

      continue;
    }

    const dynamic: Provider = {
      id: `${LONG_TAIL_PREFIX}${source.id}`,
      mark: dynamicMark(name),
      name,
      category: "Additional coverage",
      sourceLabel: PROVIDER_SOURCE_LABEL,
      capabilities: ["directory"],
      state: "unresolved",
      reason: null,
      displayPriority: 2_000 + source.displayPriority,
      homepage: null,
      tmdbProviderIds: [source.id],
      titles: 0,
    };

    providers.push(dynamic);
    byId.set(dynamic.id, dynamic);
    byCanonicalName.set(canonical, dynamic);
  }

  const declared = new Map(
    providerRegistry.map((configured) => [
      configured.id,
      { note: configured.note, catalogue: configured.catalogue },
    ]),
  );

  for (const provider of providers) {
    const carried = known.get(provider.id);

    if (directoryFailed && provider.tmdbProviderIds.length === 0 && carried) {
      provider.tmdbProviderIds = carried.tmdbProviderIds;
    }

    const covered = coverage.get(provider.id) ?? { titles: 0, fresh: 0 };

    provider.titles = covered.titles;

    const intent = declared.get(provider.id);
    const state = stateOf(
      provider.tmdbProviderIds.length > 0,
      covered,
      Boolean(carried && (carried.tmdbProviderIds.length > 0 || carried.titles > 0)),
      directoryFailed,
      intent?.catalogue ?? "film-tv",
    );

    provider.state = state;
    provider.capabilities = capabilitiesOf(provider, state);
    provider.reason = reasonFor(provider, state, intent?.note ?? null);
  }

  const configured = providers.filter((provider) => !isLongTail(provider));
  const counted = (state: ProviderState) =>
    configured.filter((provider) => provider.state === state).length;

  return {
    version: PROVIDER_LEDGER_VERSION,
    providers,
    region: "GB",
    sources: tmdbSources.length > 0 ? [PROVIDER_SOURCE_LABEL] : [],
    errors,
    stats: {
      configured: configured.length,
      live: counted("live"),
      stale: counted("stale"),
      unresolved: counted("unresolved"),
      outOfScope: counted("out-of-scope"),
      failed: counted("failed"),
      longTail: providers.length - configured.length,
      titlesCovered: configured.reduce((total, provider) => total + provider.titles, 0),
    },
    fetchedAt: new Date().toISOString(),
  };
}

export async function getProviderLedger(env: Bindings): Promise<ProvidersResponse> {
  const errors: ProviderLedgerError[] = [];

  if (!env.TMDB_API_TOKEN) {
    errors.push({ source: "TMDB", detail: "TMDB_API_TOKEN is not configured" });
  }

  const [directory, coverage, previous] = await Promise.allSettled([
    env.TMDB_API_TOKEN ? getTmdbProviders(env) : Promise.resolve([]),
    readCoverage(env.DB),
    readProviders(env.DB),
  ]);

  if (directory.status === "rejected") {
    errors.push({ source: "TMDB", detail: errorMessage(directory.reason) });
  }

  if (coverage.status === "rejected") {
    errors.push({ source: "Catalogue", detail: errorMessage(coverage.reason) });
  }

  return mergeProviderLedger(
    directory.status === "fulfilled" ? directory.value : [],
    coverage.status === "fulfilled" ? coverage.value : new Map<string, Coverage>(),
    previous.status === "fulfilled" ? previous.value : null,
    errors,
  );
}

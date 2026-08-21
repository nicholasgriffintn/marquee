import type { Provider, ProvidersResponse } from "../../src/domain/catalog.ts";
import {
  canonicalProviderName,
  findRegistryProvider,
  findRegistryProviderForOffer,
  providerRegistry,
  providerSourceLabel,
  providerStatus,
} from "../../src/domain/providers.ts";
import { getTmdbProviders } from "../clients/tmdb.ts";
import { getWatchmodeSources } from "../clients/watchmode.ts";
import { watchmodeOfferKind } from "../lib/watchmode-payload.ts";
import type { Bindings } from "../types.ts";

function configuredProviders(): Provider[] {
  return providerRegistry.map((provider, index) => ({
    id: provider.id,
    mark: provider.mark,
    name: provider.name,
    category: provider.category,
    integration: provider.integration,
    status: providerStatus(provider.integration),
    sourceLabel: providerSourceLabel(provider.integration),
    displayPriority: index,
    homepage: provider.homepage,
    watchmodeSourceIds: [],
    tmdbProviderIds: [],
  }));
}

// Aggregator names arrive with stray whitespace ("Pongalo Amazon Channel  "), which reads as a
// repeated row next to the tidy spelling of the same service.
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

// Aggregator names for one service vary ("Shudder", "Shudder Amazon Channel", "Shudder (Via
// Amazon Prime)"), so long-tail entries are indexed by their canonical name to keep the ledger
// to one row per service.
function indexProviders(byId: Map<string, Provider>) {
  const byCanonicalName = new Map<string, Provider>();

  for (const entry of providerRegistry) {
    const provider = byId.get(entry.id);

    if (!provider) {
      continue;
    }

    for (const alias of entry.aliases) {
      const canonical = canonicalProviderName(alias);

      if (canonical && !byCanonicalName.has(canonical)) {
        byCanonicalName.set(canonical, provider);
      }
    }
  }

  return byCanonicalName;
}

function isLongTail(provider: Provider) {
  return provider.id.startsWith("watchmode:") || provider.id.startsWith("tmdb:");
}

function addSourceId(ids: number[], id: number) {
  if (!ids.includes(id)) {
    ids.push(id);
  }
}

// Reseller and tier variants carry longer names than the service itself, so the shortest name
// seen is the one worth showing.
function preferName(provider: Provider, name: string) {
  if (name.length < provider.name.length) {
    provider.name = name;
    provider.mark = dynamicMark(name);
  }
}

function mergeProviderLedger(
  watchmodeSources: Awaited<ReturnType<typeof getWatchmodeSources>>,
  tmdbSources: Awaited<ReturnType<typeof getTmdbProviders>>,
  errors: string[] = [],
): ProvidersResponse {
  const providers = configuredProviders();
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const byCanonicalName = indexProviders(byId);

  for (const source of watchmodeSources) {
    const name = tidyName(source.name);
    const registry = findRegistryProviderForOffer(name, watchmodeOfferKind(source.type));
    const canonical = canonicalProviderName(name);
    const existing = registry ? byId.get(registry.id) : byCanonicalName.get(canonical);

    if (existing) {
      addSourceId(existing.watchmodeSourceIds, source.id);

      if (isLongTail(existing)) {
        preferName(existing, name);
      }

      continue;
    }

    const provider: Provider = {
      id: `watchmode:${source.id}`,
      mark: dynamicMark(name),
      name,
      category: "Additional coverage",
      integration: "watchmode",
      status: "feed",
      sourceLabel: "Watchmode",
      displayPriority: 1_000 + providers.length,
      homepage: null,
      watchmodeSourceIds: [source.id],
      tmdbProviderIds: [],
    };

    providers.push(provider);
    byId.set(provider.id, provider);
    byCanonicalName.set(canonical, provider);
  }

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
      id: `tmdb:${source.id}`,
      mark: dynamicMark(name),
      name,
      category: "Additional coverage",
      integration: "tmdb",
      status: "feed",
      sourceLabel: "TMDB / JustWatch",
      displayPriority: 2_000 + source.displayPriority,
      homepage: null,
      watchmodeSourceIds: [],
      tmdbProviderIds: [source.id],
    };

    providers.push(dynamic);
    byId.set(dynamic.id, dynamic);
    byCanonicalName.set(canonical, dynamic);
  }

  const stats = {
    configured: providerRegistry.length,
    feeds: providerRegistry.filter((provider) => providerStatus(provider.integration) === "feed")
      .length,
    links: providerRegistry.filter((provider) => providerStatus(provider.integration) === "link")
      .length,
    markers: providerRegistry.filter(
      (provider) => providerStatus(provider.integration) === "marker",
    ).length,
    longTail: providers.length - providerRegistry.length,
  };
  const sources = [
    ...(watchmodeSources.length ? ["Watchmode"] : []),
    ...(tmdbSources.length ? ["TMDB / JustWatch"] : []),
  ];

  return { providers, region: "GB", sources, errors, stats, fetchedAt: new Date().toISOString() };
}

export async function getProviderLedger(env: Bindings): Promise<ProvidersResponse> {
  const [watchmodeResult, tmdbResult] = await Promise.allSettled([
    env.WATCHMODE_API_KEY ? getWatchmodeSources(env) : Promise.resolve([]),
    env.TMDB_API_TOKEN ? getTmdbProviders(env) : Promise.resolve([]),
  ]);
  const watchmodeSources = watchmodeResult.status === "fulfilled" ? watchmodeResult.value : [];
  const tmdbSources = tmdbResult.status === "fulfilled" ? tmdbResult.value : [];
  const errors = [
    ...(watchmodeResult.status === "rejected" ? ["Watchmode provider data is unavailable"] : []),
    ...(tmdbResult.status === "rejected" ? ["TMDB provider data is unavailable"] : []),
  ];

  return mergeProviderLedger(watchmodeSources, tmdbSources, errors);
}

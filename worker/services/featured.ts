import type { CatalogSection, FeaturedSource, MediaTitle } from "../../src/domain/catalog.ts";
import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import { DEFAULT_PREFERRED_LANGUAGE } from "../../src/domain/languages.ts";
import { readCachedValue, writeCachedValue } from "../lib/cache.ts";
import { logError, logRejection } from "../lib/logging.ts";
import { readSectionFronts, readSummaryItems } from "../repositories/catalog-reader.ts";
import { readPreferredLanguage } from "../repositories/notebook-preferences.ts";
import type { Bindings } from "../types.ts";
import { readTrendingBuzz } from "./buzz.ts";
import { chooseFeatured, type FeaturedCandidate } from "./featured-selection.ts";
import { getPersonalRails } from "./personal-rails.ts";
import { readLatestRails } from "./rail-generation.ts";
import type { StoredRail } from "./rail-identity.ts";
import { eligibilityGate, type Eligibility } from "./viewer/eligibility.ts";
import { eligibilityFor, readViewerState, type ViewerState } from "./viewer/state.ts";

const ITEMS_PER_SOURCE = 8;
const ITEMS_PER_SECTION = 2;
const FEATURED_CACHE_SECONDS = 300;

type FeaturedTitle = {
  item: MediaTitle | null;
  source: FeaturedSource | null;
  fetchedAt: string;
};

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function sectionFronts(sections: CatalogSection[]) {
  const items: MediaTitle[] = [];

  for (let position = 0; position < ITEMS_PER_SECTION; position += 1) {
    for (const section of sections) {
      const item = section.items[position];

      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

function candidatePool(
  sources: Array<{ source: FeaturedSource; items: MediaTitle[] }>,
  eligibility: Eligibility,
) {
  const seen = new Set<string>();
  const candidates: FeaturedCandidate[] = [];
  const admits = eligibilityGate(eligibility);

  for (const source of sources) {
    let added = 0;

    for (const item of source.items) {
      if (added >= ITEMS_PER_SOURCE) {
        break;
      }

      if (seen.has(item.id) || !item.backdropUrl || !item.overview.trim() || !admits(item)) {
        continue;
      }

      seen.add(item.id);
      candidates.push({ item, source: source.source, position: added });
      added += 1;
    }
  }

  return candidates;
}

function featuredCacheKey(
  viewerId: string | null,
  providerIds: string[],
  preferredLanguage: string,
  day: string,
) {
  return `featured:${day}:${viewerId ?? "front-of-house"}:${preferredLanguage}:${providerIds.toSorted().join(",")}`;
}

function frontIds(rails: StoredRail[]) {
  const ids: string[] = [];

  for (let position = 0; position < ITEMS_PER_SECTION; position += 1) {
    for (const rail of rails) {
      const titleId = rail.titleIds[position];

      if (titleId) {
        ids.push(titleId);
      }
    }
  }

  return [...new Set(ids)].slice(0, ITEMS_PER_SOURCE);
}

async function personalItems(env: Bindings, viewer: ViewerState, origin: ViewerOrigin | null) {
  const [stored, personal] = await Promise.all([
    readLatestRails(env.DB, viewer.viewerId),
    getPersonalRails(env, viewer.viewerId, origin),
  ]);
  const storedIds = frontIds(stored);
  const storedItems = await readSummaryItems(env.DB, storedIds, storedIds.length);
  const byId = new Map(storedItems.map((item) => [item.id, item]));
  const curated = storedIds.flatMap((id) => byId.get(id) ?? []);

  return [...curated, ...sectionFronts(personal)];
}

async function trendingItems(env: Bindings) {
  const ranked = await readTrendingBuzz(env, ITEMS_PER_SOURCE * 2);

  return readSummaryItems(
    env.DB,
    ranked.map((entry) => entry.titleId),
    ranked.length,
  );
}

export async function getFeaturedTitle(
  env: Bindings,
  options: {
    viewerId: string | null;
    providerIds: string[];
    origin: ViewerOrigin | null;
    now?: Date;
    refresh?: boolean;
    defer?: (task: Promise<unknown>) => void;
  },
) {
  const { viewerId, providerIds, origin, now = new Date(), refresh = false, defer } = options;
  const language = await readPreferredLanguage(env.DB, viewerId ?? "").catch((error: unknown) => {
    logError("featured_language_read_failed", error);

    return DEFAULT_PREFERRED_LANGUAGE;
  });
  const cacheKey = featuredCacheKey(viewerId, providerIds, language, dayKey(now));
  const cached = refresh
    ? null
    : await readCachedValue<FeaturedTitle>(cacheKey).catch((error: unknown) => {
        logError("featured_cache_read_failed", error);

        return null;
      });

  if (cached) {
    return cached;
  }

  const viewer = await readViewerState(env, viewerId ?? "", { providerIds });

  const [catalogue, trending, personal] = await Promise.all([
    readSectionFronts(env.DB, viewer.providerIds, ITEMS_PER_SECTION),
    trendingItems(env).catch(() => []),
    viewerId ? personalItems(env, viewer, origin) : Promise.resolve([]),
  ]);
  const candidates = candidatePool(
    [
      ...(personal.length ? [{ source: "personal" as const, items: personal }] : []),
      { source: "trending", items: trending },
      { source: "catalogue", items: sectionFronts(catalogue) },
    ],
    eligibilityFor(viewer, {
      availability: "confirmed-or-unknown",
      exclude: viewer.entries.map((entry) => entry.titleId),
    }),
  );
  const featured = chooseFeatured(candidates, viewerId ?? "front-of-house", now);
  const result: FeaturedTitle = {
    item: featured?.item ?? null,
    source: featured?.source ?? null,
    fetchedAt: now.toISOString(),
  };

  if (result.item) {
    const write = logRejection(
      writeCachedValue(cacheKey, result, FEATURED_CACHE_SECONDS),
      "featured_cache_write_failed",
    );

    if (defer) {
      defer(write);
    } else {
      await write;
    }
  }

  return result;
}

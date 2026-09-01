import type { CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import { rankingHash } from "../../src/lib/string.ts";
import { readCachedValue, writeCachedValue } from "../lib/cache.ts";
import { logError, logRejection } from "../lib/logging.ts";
import { readSectionFronts, readSummaryItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";
import { readTrendingBuzz } from "./buzz.ts";
import { getPersonalRails } from "./personal-rails.ts";
import { readRecentRails } from "./rail-generation.ts";
import type { StoredRail } from "./rail-identity.ts";
import { eligibilityGate, type Eligibility } from "./viewer/eligibility.ts";
import { eligibilityFor, readViewerState, type ViewerState } from "./viewer/state.ts";

const ITEMS_PER_SOURCE = 8;
const ITEMS_PER_SECTION = 2;
const DAY_MS = 86_400_000;
const FEATURED_CACHE_SECONDS = 300;
const SOURCE_PRIORITY: Record<FeaturedSource, number> = {
  personal: 3,
  trending: 2,
  catalogue: 1,
};

type FeaturedSource = "personal" | "trending" | "catalogue";
type FeaturedCandidate = { item: MediaTitle; source: FeaturedSource };
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
      candidates.push({ item, source: source.source });
      added += 1;
    }
  }

  return candidates;
}

function weightedRank(candidate: FeaturedCandidate, identity: string, day: string) {
  const hash = rankingHash(`${day}:${identity}:${candidate.item.id}`);
  const uniform = (hash + 1) / (2 ** 32 + 1);

  return -Math.log(uniform) / SOURCE_PRIORITY[candidate.source];
}

function bestFor(candidates: FeaturedCandidate[], identity: string, day: string, excludedId = "") {
  let best: FeaturedCandidate | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.item.id === excludedId) {
      continue;
    }

    const rank = weightedRank(candidate, identity, day);

    if (
      rank < bestRank ||
      (rank === bestRank && candidate.item.id.localeCompare(best?.item.id ?? "") < 0)
    ) {
      best = candidate;
      bestRank = rank;
    }
  }

  return best;
}

function chooseFeatured(candidates: FeaturedCandidate[], identity: string, now: Date) {
  const today = dayKey(now);
  const first = bestFor(candidates, identity, today);

  if (!first || candidates.length === 1) {
    return first;
  }

  const yesterday = new Date(now.getTime() - DAY_MS);
  const previous = bestFor(candidates, identity, dayKey(yesterday));

  return previous?.item.id === first.item.id
    ? (bestFor(candidates, identity, today, first.item.id) ?? first)
    : first;
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
    readRecentRails(env.DB, viewer.viewerId),
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
    defer?: (task: Promise<unknown>) => void;
  },
) {
  const { viewerId, providerIds, origin, now = new Date(), defer } = options;
  const viewer = await readViewerState(env, viewerId ?? "", { providerIds });
  const cacheKey = featuredCacheKey(
    viewerId,
    providerIds,
    viewer.preferences.preferredLanguage,
    dayKey(now),
  );
  const cached = await readCachedValue<FeaturedTitle>(cacheKey).catch((error: unknown) => {
    logError("featured_cache_read_failed", error);

    return null;
  });

  if (cached) {
    return cached;
  }

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
    eligibilityFor(viewer, { availability: "confirmed-or-unknown" }),
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

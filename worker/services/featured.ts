import type { CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import { hashString } from "../../src/lib/string.ts";
import { includesProvider } from "../repositories/catalog-reader.ts";
import { neverTitleIds } from "../repositories/signals.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { getAiRails } from "./ai-rails.ts";
import { getCatalogue, getTrending } from "./catalog.ts";
import { getPersonalRails } from "./personal-rails.ts";

const ITEMS_PER_SOURCE = 6;
const ITEMS_PER_SECTION = 2;
const DAY_MS = 86_400_000;

type FeaturedSource = "personal" | "trending" | "catalogue";
type FeaturedCandidate = { item: MediaTitle; source: FeaturedSource };

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
  providerIds: string[],
  excluded: ReadonlySet<string>,
) {
  const seen = new Set<string>();
  const candidates: FeaturedCandidate[] = [];

  for (const source of sources) {
    let added = 0;

    for (const item of source.items) {
      if (added >= ITEMS_PER_SOURCE) {
        break;
      }

      if (
        seen.has(item.id) ||
        excluded.has(item.id) ||
        !item.backdropUrl ||
        !item.overview.trim() ||
        !includesProvider(item, providerIds)
      ) {
        continue;
      }

      seen.add(item.id);
      candidates.push({ item, source: source.source });
      added += 1;
    }
  }

  return candidates;
}

function bestFor(candidates: FeaturedCandidate[], identity: string, day: string, excludedId = "") {
  let best: FeaturedCandidate | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.item.id === excludedId) {
      continue;
    }

    const rank = hashString(`${day}:${identity}:${candidate.item.id}`);

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

async function personalSections(env: Bindings, viewerId: string, origin: ViewerOrigin | null) {
  const [personal, ai] = await Promise.all([
    getPersonalRails(env, viewerId, origin),
    getAiRails(env, viewerId)
      .then((result) => (result.isFresh ? result.sections : []))
      .catch((): CatalogSection[] => []),
  ]);

  return [...ai, ...personal];
}

async function excludedTitleIds(env: Bindings, viewerId: string | null, providerIds: string[]) {
  if (!viewerId) {
    return new Set<string>();
  }

  const [viewer, refused] = await Promise.all([
    readViewerContext(env.DB, viewerId, providerIds),
    neverTitleIds(env.DB, viewerId),
  ]);

  return new Set([
    ...refused,
    ...viewer.entries
      .filter((entry) => entry.status === "watched" || entry.status === "dropped")
      .map((entry) => entry.titleId),
  ]);
}

export async function getFeaturedTitle(
  env: Bindings,
  options: {
    viewerId: string | null;
    providerIds: string[];
    origin: ViewerOrigin | null;
    now?: Date;
  },
) {
  const { viewerId, providerIds, origin, now = new Date() } = options;
  const [catalogue, trending, personal, excluded] = await Promise.all([
    getCatalogue(env, providerIds),
    getTrending(env).catch(() => ({ items: [] })),
    viewerId ? personalSections(env, viewerId, origin) : Promise.resolve([]),
    excludedTitleIds(env, viewerId, providerIds),
  ]);
  const candidates = candidatePool(
    [
      ...(personal.length ? [{ source: "personal" as const, items: sectionFronts(personal) }] : []),
      { source: "trending", items: trending.items },
      { source: "catalogue", items: sectionFronts(catalogue?.sections ?? []) },
    ],
    providerIds,
    excluded,
  );
  const featured = chooseFeatured(candidates, viewerId ?? "front-of-house", now);

  return {
    item: featured?.item ?? null,
    source: featured?.source ?? null,
    fetchedAt: now.toISOString(),
  };
}

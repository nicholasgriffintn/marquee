import type { CatalogSection, MediaTitle } from "../../src/domain/catalog.ts";
import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import { personalFrom } from "../../src/domain/rails.ts";
import { hashString } from "../../src/lib/string.ts";
import type { Bindings } from "../types.ts";
import { getCatalogue, getTrending } from "./catalog.ts";
import { deliverRails } from "./rail-delivery.ts";
import { eligibilityGate, type Eligibility } from "./viewer/eligibility.ts";
import { eligibilityFor, readViewerState, type ViewerState } from "./viewer/state.ts";

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

async function personalSections(env: Bindings, viewer: ViewerState, origin: ViewerOrigin | null) {
  const delivery = await deliverRails(env, {
    viewerId: viewer.viewerId,
    origin,
    generate: false,
  });

  return delivery.status === "ready" ? delivery.rails : personalFrom(delivery);
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
  const viewer = await readViewerState(env, viewerId ?? "", { providerIds });
  const [catalogue, trending, personal] = await Promise.all([
    getCatalogue(env, viewer.providerIds),
    getTrending(env).catch(() => ({ items: [] })),
    viewerId ? personalSections(env, viewer, origin) : Promise.resolve([]),
  ]);
  const candidates = candidatePool(
    [
      ...(personal.length ? [{ source: "personal" as const, items: sectionFronts(personal) }] : []),
      { source: "trending", items: trending.items },
      { source: "catalogue", items: sectionFronts(catalogue?.sections ?? []) },
    ],
    eligibilityFor(viewer, { availability: "confirmed-or-unknown" }),
  );
  const featured = chooseFeatured(candidates, viewerId ?? "front-of-house", now);

  return {
    item: featured?.item ?? null,
    source: featured?.source ?? null,
    fetchedAt: now.toISOString(),
  };
}

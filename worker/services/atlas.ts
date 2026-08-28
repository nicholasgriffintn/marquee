import type { ShelfAtlas } from "../../src/domain/places.ts";
import { readCachedValue, writeCachedValue } from "../lib/cache.ts";
import { countPlacedShelfTitles, readShelfPlaces } from "../repositories/title-places.ts";
import { readViewerContext } from "../repositories/viewer-context.ts";
import type { Bindings, ViewingContext } from "../types.ts";

const MINIMUM_PLACES = 3;
const ATLAS_CACHE_SECONDS = 21_600;

function shelfSignature(entries: ViewingContext[]) {
  return `${entries.length}:${entries[0]?.updatedAt ?? ""}`;
}

export async function buildShelfAtlas(
  env: Bindings,
  viewerId: string,
  options: { schedule?: (task: Promise<unknown>) => void } = {},
): Promise<ShelfAtlas> {
  const viewer = await readViewerContext(env.DB, viewerId);
  const cacheKey = `notebook-atlas:${viewerId}:${shelfSignature(viewer.entries)}`;
  const cached = await readCachedValue<ShelfAtlas>(cacheKey);

  if (cached) {
    return cached;
  }

  const [places, placedCount] = await Promise.all([
    readShelfPlaces(env.DB, viewerId),
    countPlacedShelfTitles(env.DB, viewerId),
  ]);
  const countries = [...new Set(places.flatMap((place) => (place.country ? [place.country] : [])))];

  countries.sort((left, right) => left.localeCompare(right));

  const atlas: ShelfAtlas = {
    status: places.length >= MINIMUM_PLACES ? "ready" : "sparse",
    places,
    shelfCount: viewer.entries.length,
    placedCount,
    countries,
  };

  if (atlas.status === "ready") {
    const store = writeCachedValue(cacheKey, atlas, ATLAS_CACHE_SECONDS);

    if (options.schedule) {
      options.schedule(store);
    } else {
      await store;
    }
  }

  return atlas;
}

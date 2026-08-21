import type { MediaTitle } from "../../src/domain/catalog.ts";
import { logError } from "../lib/logging.ts";
import { readAvailability, readCatalog, readItems } from "../repositories/catalog-reader.ts";
import { readProviders } from "../repositories/providers.ts";
import type { Bindings } from "../types.ts";
import { findPendingTitles } from "./discovery.ts";

export async function getCatalogue(env: Bindings, providerIds: string[]) {
  return readCatalog(env.DB, "", providerIds);
}

export async function searchCatalogue(env: Bindings, query: string, providerIds: string[]) {
  const catalogue = await readCatalog(env.DB, query, providerIds);
  const items = catalogue?.sections[0]?.items ?? [];
  let pending: MediaTitle[] = [];

  try {
    pending = await findPendingTitles(env, query, items);
  } catch (error) {
    logError("pending_lookup_failed", error, { area: "search" });
  }

  return {
    items: [...items, ...pending],
    query,
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCatalogueItems(db: D1Database, ids: string[]) {
  return {
    items: await readItems(db, ids),
    source: "Marquee catalogue",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getProviderCatalogue(db: D1Database) {
  return readProviders(db);
}

export async function getTitleAvailability(db: D1Database, titleId: string) {
  const providers = await readAvailability(db, titleId);

  return providers
    ? {
        providers,
        source: "Marquee catalogue",
        fetchedAt: new Date().toISOString(),
      }
    : null;
}

import { readAvailability, readCatalog, readItems } from "../repositories/catalog-reader.ts";
import { readProviders } from "../repositories/providers.ts";

export async function getCatalogue(db: D1Database, query: string, providerIds: string[]) {
  return readCatalog(db, query, providerIds);
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

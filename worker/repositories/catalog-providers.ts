import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

type ProviderRow = {
  titleId: string;
  id: string;
  name: string;
  webUrl: string | null;
  source: string;
};
type OfferRow = { titleId: string; providerId: string; offerType: string };

export async function readProviderMap(db: D1Database, ids: string[]) {
  const [providerRows, offerRows] = await Promise.all([
    queryChunked(ids, (wave) =>
      db
        .prepare(
          `SELECT title_id AS titleId, provider_id AS id, name, web_url AS webUrl, source
           FROM catalog_title_providers
           WHERE title_id IN (${wave.map(() => "?").join(",")})
           ORDER BY title_id, position`,
        )
        .bind(...wave)
        .all<ProviderRow>()
        .then((result) => result.results),
    ),
    queryChunked(ids, (wave) =>
      db
        .prepare(
          `SELECT title_id AS titleId, provider_id AS providerId, offer_type AS offerType
           FROM catalog_title_provider_offers
           WHERE title_id IN (${wave.map(() => "?").join(",")})
           ORDER BY title_id, provider_id, position`,
        )
        .bind(...wave)
        .all<OfferRow>()
        .then((result) => result.results),
    ),
  ]);

  const offersByKey = new Map<string, string[]>();

  for (const offer of offerRows) {
    const key = `${offer.titleId}:${offer.providerId}`;
    const list = offersByKey.get(key);

    if (list) {
      list.push(offer.offerType);
    } else {
      offersByKey.set(key, [offer.offerType]);
    }
  }

  const grouped = groupBy(providerRows, (row) => row.titleId);
  const values = new Map<string, ProviderAvailability[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map((entry): ProviderAvailability => ({
        id: entry.id,
        name: entry.name,
        webUrl: entry.webUrl,
        source: entry.source as ProviderAvailability["source"],
        offerTypes: offersByKey.get(`${titleId}:${entry.id}`) ?? [],
      })),
    );
  }

  return values;
}

export async function writeProviderRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_providers",
    titles.map((title) => title.id),
  );
  await deleteByTitleIds(
    db,
    "catalog_title_provider_offers",
    titles.map((title) => title.id),
  );

  const providerRows = titles.flatMap((title) =>
    title.providers.map((provider, position): unknown[] => [
      title.id,
      provider.id,
      provider.name,
      provider.webUrl,
      provider.source,
      position,
    ]),
  );

  await insertRows(
    db,
    6,
    15,
    providerRows,
    (chunk) =>
      `INSERT INTO catalog_title_providers (title_id, provider_id, name, web_url, source, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (title_id, provider_id) DO UPDATE SET
         name = excluded.name, web_url = excluded.web_url,
         source = excluded.source, position = excluded.position`,
  );

  const offerRows = titles.flatMap((title) =>
    title.providers.flatMap((provider) =>
      [...new Set(provider.offerTypes)].map((offerType, position): unknown[] => [
        title.id,
        provider.id,
        offerType,
        position,
      ]),
    ),
  );

  await insertRows(
    db,
    4,
    22,
    offerRows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_provider_offers
         (title_id, provider_id, offer_type, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
  );
}

import type { ProvidersResponse } from "../../src/domain/catalog.ts";
import { parseStoredProviders } from "../lib/catalog-payload.ts";

type ProviderRow = { payload: string };

export async function storeProviders(db: D1Database, providers: ProvidersResponse) {
  await db
    .prepare(
      `INSERT INTO provider_snapshots (region, payload, source_updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(region) DO UPDATE SET
         payload = excluded.payload,
         source_updated_at = excluded.source_updated_at,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(providers.region, JSON.stringify(providers), providers.fetchedAt)
    .run();
}

export async function readProviders(db: D1Database) {
  const row = await db
    .prepare(
      `SELECT payload
       FROM provider_snapshots
       WHERE region = ?
       LIMIT 1`,
    )
    .bind("GB")
    .first<ProviderRow>();

  return row ? parseStoredProviders(row.payload) : null;
}

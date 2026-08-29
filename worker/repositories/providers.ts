import type { ProvidersResponse } from "../../src/domain/catalog.ts";
import { parseStoredProviders } from "../lib/catalog-payload.ts";

type ProviderRow = { payload: string };

export async function storeProviders(db: Database, providers: ProvidersResponse) {
  await db.execute(
    `INSERT INTO provider_snapshots (region, payload, source_updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(region) DO UPDATE SET
         payload = excluded.payload,
         source_updated_at = excluded.source_updated_at,
         updated_at = CURRENT_TIMESTAMP`,
    [providers.region, JSON.stringify(providers), providers.fetchedAt],
  );
}

export async function readProviders(db: Database) {
  const row = await db.first<ProviderRow>(
    `SELECT payload
       FROM provider_snapshots
       WHERE region = $1
       LIMIT 1`,
    ["GB"],
  );

  return row ? parseStoredProviders(row.payload) : null;
}

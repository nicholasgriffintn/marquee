import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { recordProviderState } from "./arrivals.ts";
import { writeProviderRows } from "./catalog-providers.ts";
import { readRawItems } from "./catalog-reader.ts";
import { EXTERNAL_PROVIDER_SOURCES } from "./catalog-writer.ts";

export async function markAvailabilityChecked(db: D1Database, titleId: string) {
  await db
    .prepare(
      `UPDATE catalog_titles
       SET enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(titleId)
    .run();
}

export async function claimAvailabilityRefresh(db: D1Database, titleId: string) {
  const result = await db
    .prepare(
      `UPDATE catalog_titles
       SET availability_claimed_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (availability_claimed_at IS NULL OR availability_claimed_at < datetime('now', '-30 seconds'))`,
    )
    .bind(titleId)
    .run();

  return result.meta.changes > 0;
}

export async function releaseAvailabilityClaim(db: D1Database, titleId: string) {
  await db
    .prepare(`UPDATE catalog_titles SET availability_claimed_at = NULL WHERE id = ?`)
    .bind(titleId)
    .run();
}

export async function enrichAvailability(
  db: D1Database,
  titleId: string,
  availability: ProviderAvailability[],
) {
  const [title, previous] = await Promise.all([
    readRawItems(db, [titleId]).then((titles) => titles.get(titleId)),
    db
      .prepare(`SELECT enriched_at AS enrichedAt FROM catalog_titles WHERE id = ?`)
      .bind(titleId)
      .first<{ enrichedAt: string | null }>(),
  ]);

  if (!title) {
    return false;
  }

  const storedById = new Map(title.providers.map((provider) => [provider.id, provider]));
  const freshIds = new Set(availability.map((provider) => provider.id));

  const mergedProviders = [
    ...availability.map((provider) => ({
      ...provider,
      webUrl: provider.webUrl ?? storedById.get(provider.id)?.webUrl ?? title.watchLink,
    })),
    ...title.providers.filter(
      (provider) => !EXTERNAL_PROVIDER_SOURCES.has(provider.source) && !freshIds.has(provider.id),
    ),
  ];

  const enrichedTitle = {
    ...title,
    providers: mergedProviders,
  } satisfies MediaTitle;

  await writeProviderRows(db, [enrichedTitle]);
  await db
    .prepare(
      `UPDATE catalog_titles
       SET enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(titleId)
    .run();

  await recordProviderState(db, titleId, enrichedTitle.providers, !previous?.enrichedAt);

  return true;
}

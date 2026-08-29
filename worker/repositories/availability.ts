import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { recordProviderState } from "./arrivals.ts";
import { writeProviderRows } from "./catalog-providers.ts";
import { readRawItems } from "./catalog-reader.ts";
import { EXTERNAL_PROVIDER_SOURCES } from "./catalog-writer.ts";

export async function markAvailabilityChecked(db: Database, titleId: string) {
  await db.execute(
    `UPDATE catalog_titles
       SET enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
    [titleId],
  );
}

export async function claimAvailabilityRefresh(db: Database, titleId: string) {
  const result = await db.execute(
    `UPDATE catalog_titles
       SET availability_claimed_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND (availability_claimed_at IS NULL OR availability_claimed_at < (CURRENT_TIMESTAMP - INTERVAL '30 second'))`,
    [titleId],
  );

  return result.rowCount > 0;
}

export async function releaseAvailabilityClaim(db: Database, titleId: string) {
  await db.execute(`UPDATE catalog_titles SET availability_claimed_at = NULL WHERE id = $1`, [
    titleId,
  ]);
}

export async function enrichAvailability(
  db: Database,
  titleId: string,
  availability: ProviderAvailability[],
) {
  const [title, previous] = await Promise.all([
    readRawItems(db, [titleId]).then((titles) => titles.get(titleId)),
    db.first<{ enrichedAt: string | null }>(
      `SELECT enriched_at AS "enrichedAt" FROM catalog_titles WHERE id = $1`,
      [titleId],
    ),
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
  await db.execute(
    `UPDATE catalog_titles
       SET enriched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
    [titleId],
  );

  await recordProviderState(db, titleId, enrichedTitle.providers, !previous?.enrichedAt);

  return true;
}

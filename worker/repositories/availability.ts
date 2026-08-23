import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { recordProviderState } from "./arrivals.ts";
import { readRawItems } from "./catalog-reader.ts";

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

  const mergedProviders = new Map(
    title.providers
      .filter((provider) => provider.source === "TMDB / JustWatch")
      .map((provider) => [provider.id, provider]),
  );

  for (const provider of availability) {
    const existing = mergedProviders.get(provider.id);

    mergedProviders.set(provider.id, {
      ...provider,
      webUrl: provider.webUrl ?? existing?.webUrl ?? title.watchLink,
      offerTypes: [...new Set([...(existing?.offerTypes ?? []), ...provider.offerTypes])],
    });
  }

  const enrichedTitle = {
    ...title,
    providers: [...mergedProviders.values()],
  } satisfies MediaTitle;

  await db
    .prepare(
      `UPDATE catalog_titles
       SET
         provider_ids = ?,
         payload = ?,
         enriched_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      JSON.stringify(enrichedTitle.providers.map((provider) => provider.id)),
      JSON.stringify(enrichedTitle),
      titleId,
    )
    .run();

  await recordProviderState(db, titleId, enrichedTitle.providers, !previous?.enrichedAt);

  return true;
}

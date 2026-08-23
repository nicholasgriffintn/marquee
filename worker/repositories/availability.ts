import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { recordProviderState } from "./arrivals.ts";
import { readRawItems } from "./catalog-reader.ts";

export async function enrichAvailability(
  db: D1Database,
  titleId: string,
  availability: ProviderAvailability[],
) {
  const title = (await readRawItems(db, [titleId])).get(titleId);

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

  await recordProviderState(db, titleId, enrichedTitle.providers);

  return true;
}

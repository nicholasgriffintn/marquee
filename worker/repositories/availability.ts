import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { readItems } from "./catalog-reader.ts";

export async function enrichAvailability(
  db: D1Database,
  titleId: string,
  availability: ProviderAvailability[],
) {
  const [title] = await readItems(db, [titleId]);

  if (!title) {
    return false;
  }

  const mergedProviders = new Map(title.providers.map((provider) => [provider.id, provider]));

  for (const provider of availability) {
    const existing = mergedProviders.get(provider.id);

    mergedProviders.set(provider.id, {
      ...provider,
      logoUrl: provider.logoUrl ?? existing?.logoUrl ?? null,
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

  return true;
}

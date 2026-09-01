import type { MediaTitle } from "../../src/domain/catalog.ts";
import { isStreamingAvailability, STREAMING_OFFER_TYPES } from "../../src/domain/providers.ts";

const STREAMING_LIST = STREAMING_OFFER_TYPES.map((offer) => `'${offer}'`).join(", ");

export function includesProvider(title: MediaTitle, providerIds: string[]) {
  return title.providers.some(
    (provider) => providerIds.includes(provider.id) && isStreamingAvailability(provider.offerTypes),
  );
}

export function providerFilterSql(titleIdExpression: string, providerIdsParameter: string) {
  return `(
    NOT EXISTS (
      SELECT 1 FROM catalog_title_providers AS ap WHERE ap.title_id = ${titleIdExpression}
    )
    OR EXISTS (
      SELECT 1 FROM catalog_title_providers AS mp
       WHERE mp.title_id = ${titleIdExpression}
         AND mp.provider_id IN (SELECT value FROM jsonb_array_elements_text(CAST(${providerIdsParameter} AS jsonb)) AS entries(value))
         AND (
           NOT EXISTS (
             SELECT 1 FROM catalog_title_provider_offers AS ao
              WHERE ao.title_id = mp.title_id AND ao.provider_id = mp.provider_id
           )
           OR EXISTS (
             SELECT 1 FROM catalog_title_provider_offers AS so
              WHERE so.title_id = mp.title_id AND so.provider_id = mp.provider_id
                AND so.offer_type IN (${STREAMING_LIST})
           )
         )
    )
  )`;
}

export function selectedProviderIdCondition(
  providerIdExpression: string,
  providerIdsExpression: string,
) {
  const ids = `CAST(COALESCE(NULLIF(${providerIdsExpression}, ''), '[]') AS jsonb)`;

  return `(jsonb_array_length(${ids}) = 0 OR ${providerIdExpression} IN (
    SELECT value FROM jsonb_array_elements_text(${ids}) AS selected_provider(value)
  ))`;
}

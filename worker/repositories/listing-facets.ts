import { STREAMING_OFFER_TYPES } from "../../src/domain/providers.ts";

export type StreamingProvider = { id: string; name: string; titles: number };

const MINIMUM_TITLES = 100;

export async function readStreamingProviders(db: Database, limit: number) {
  const offers = STREAMING_OFFER_TYPES.map((_, index) => `$${index + 3}`).join(", ");
  const rows = await db.query<StreamingProvider>(
    `SELECT p.provider_id AS id, MIN(p.name) AS name, COUNT(DISTINCT p.title_id)::int AS titles
       FROM catalog_title_providers AS p
       JOIN catalog_title_provider_offers AS o
         ON o.title_id = p.title_id AND o.provider_id = p.provider_id
      WHERE o.offer_type IN (${offers})
        AND p.provider_id NOT LIKE '%:%'
      GROUP BY p.provider_id
     HAVING COUNT(DISTINCT p.title_id) >= $1
      ORDER BY titles DESC, id
      LIMIT $2`,
    [MINIMUM_TITLES, Math.min(Math.max(1, limit), 40), ...STREAMING_OFFER_TYPES],
  );

  return rows.rows;
}

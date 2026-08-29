import type { TitlePlace, TitlePlaces } from "../../src/domain/places.ts";
import { placePin } from "../../src/domain/places.ts";
import type { PlaceRecord, TitlePlaceRow } from "../clients/wikidata-places.ts";
import { isKnownTitle } from "../lib/validation.ts";

type PlaceRow = {
  entityId: string;
  label: string;
  latitude: number;
  longitude: number;
  precisionDegrees: number;
  country: string | null;
  countryId: string | null;
};

type TitlePlaceReadRow = PlaceRow & { titleId: string; kind: string };

const PLACE_COLUMNS = `p.entity_id AS "entityId", p.label, p.latitude, p.longitude,
       p.precision_degrees AS "precisionDegrees", p.country_id AS "countryId",
       c.label AS country`;

function toPlace(row: TitlePlaceReadRow): TitlePlace {
  return {
    entityId: row.entityId,
    label: row.label,
    kind: row.kind === "filming" ? "filming" : "narrative",
    latitude: row.latitude,
    longitude: row.longitude,
    pin: placePin(row.precisionDegrees),
    country: row.country,
    isCountry: row.countryId === row.entityId,
  };
}

export const PLACE_SOURCE = "wikidata";

export async function writeTitlePlaces(
  db: Database,
  titleIds: string[],
  rows: TitlePlaceRow[],
  countries: PlaceRecord[],
  source: string = PLACE_SOURCE,
) {
  const places = new Map<string, PlaceRecord>();

  for (const country of countries) {
    places.set(country.entityId, country);
  }

  for (const row of rows) {
    places.set(row.place.entityId, row.place);
  }

  const known = new Set(places.keys());

  await db.transaction(async (transaction) => {
    for (const place of places.values()) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO catalog_places
             (entity_id, label, latitude, longitude, precision_degrees, country_id, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
           ON CONFLICT(entity_id) DO UPDATE SET
             label = excluded.label,
             latitude = excluded.latitude,
             longitude = excluded.longitude,
             precision_degrees = excluded.precision_degrees,
             country_id = excluded.country_id,
             fetched_at = CURRENT_TIMESTAMP`,
        [
          place.entityId,
          place.label,
          place.latitude,
          place.longitude,
          place.precisionDegrees,
          place.countryId && known.has(place.countryId) ? place.countryId : null,
        ],
      );
    }

    for (const titleId of titleIds) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `DELETE FROM catalog_title_places WHERE title_id = $1 AND source = $2`,
        [titleId, source],
      );
    }

    for (const row of rows) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO catalog_title_places (title_id, kind, place_id, source)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
        [row.key, row.kind, row.place.entityId, source],
      );
    }

    for (const titleId of titleIds) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO catalog_title_place_sync (title_id, source, places, synced_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(title_id, source) DO UPDATE SET
             places = excluded.places,
           synced_at = CURRENT_TIMESTAMP`,
        [titleId, source, rows.filter((row) => row.key === titleId).length],
      );
    }
  });

  return rows.length;
}

export async function readPlacesForTitle(db: Database, titleId: string): Promise<TitlePlaces> {
  const rows = await db.query<TitlePlaceReadRow>(
    `SELECT DISTINCT tp.title_id AS "titleId", tp.kind, ${PLACE_COLUMNS}
       FROM catalog_title_places AS tp
       JOIN catalog_places AS p ON p.entity_id = tp.place_id
       LEFT JOIN catalog_places AS c ON c.entity_id = p.country_id
       WHERE tp.title_id = $1
       ORDER BY p.precision_degrees, p.label`,
    [titleId],
  );
  const places = rows.rows.map(toPlace);

  return {
    filming: places.filter((place) => place.kind === "filming"),
    narrative: places.filter((place) => place.kind === "narrative"),
  };
}

export async function readPlaceCandidates(
  db: Database,
  limit: number,
  refreshDays: number,
  retryDays: number,
) {
  const rows = await db.query<{
    titleId: string;
    mediaType: "movie" | "tv";
    tmdbId: number;
    wikidataId: string | null;
  }>(
    `SELECT t.id AS "titleId", t.media_type AS "mediaType", t.tmdb_id AS "tmdbId",
              t.wikidata_id AS "wikidataId"
       FROM title_working_set AS w
       JOIN catalog_titles AS t ON t.id = w.title_id
       LEFT JOIN catalog_title_place_sync AS s ON s.title_id = t.id AND s.source = $4
       WHERE s.title_id IS NULL
          OR (s.places > 0 AND s.synced_at < (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)))
          OR (s.places = 0 AND s.synced_at < (CURRENT_TIMESTAMP + CAST($2 AS INTERVAL)))
       ORDER BY w.demand DESC, t.popularity DESC
       LIMIT $3`,
    [`-${refreshDays} days`, `-${retryDays} days`, limit, PLACE_SOURCE],
  );

  return rows.rows.filter((row) => isKnownTitle(row.titleId));
}

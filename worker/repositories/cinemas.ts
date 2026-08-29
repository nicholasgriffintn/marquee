import type { Cinema, ScreeningPrecision } from "../../src/domain/cinema.ts";
import type { SourceCinema, SourceFilm, SourceScreening } from "../clients/cinema/types.ts";
import { addDays, utcDay } from "../lib/dates.ts";
import { boundingBox, haversineKm, interestCell } from "../lib/geo.ts";
import { parseJson } from "../lib/values.ts";
import { hashState } from "./links.ts";

type CinemaRow = {
  id: string;
  source: string;
  siteId: string;
  name: string;
  chain: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  bookingUrl: string | null;
};

export function cinemaKey(source: string, siteId: string) {
  return `${source}:${siteId}`;
}

function toCinema(row: CinemaRow, distanceKm: number | null): Cinema {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    chain: row.chain,
    address: row.address,
    postcode: row.postcode,
    latitude: row.latitude,
    longitude: row.longitude,
    bookingUrl: row.bookingUrl,
    distanceKm,
  };
}

export async function storeCinemas(
  db: Database,
  source: string,
  chain: string,
  cinemas: SourceCinema[],
) {
  if (cinemas.length === 0) {
    return 0;
  }

  await db.transaction(async (transaction) => {
    for (const cinema of cinemas) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO cinemas
           (id, source, site_id, name, chain, address, postcode, latitude, longitude, booking_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(source, site_id) DO UPDATE SET
           name = excluded.name,
           chain = excluded.chain,
           address = COALESCE(excluded.address, cinemas.address),
           postcode = COALESCE(excluded.postcode, cinemas.postcode),
           latitude = COALESCE(excluded.latitude, cinemas.latitude),
           longitude = COALESCE(excluded.longitude, cinemas.longitude),
           booking_url = COALESCE(excluded.booking_url, cinemas.booking_url),
           seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [
          cinemaKey(source, cinema.siteId),
          source,
          cinema.siteId,
          cinema.name,
          chain,
          cinema.address,
          cinema.postcode,
          cinema.latitude,
          cinema.longitude,
          cinema.bookingUrl,
        ],
      );
    }
  });

  return cinemas.length;
}

export async function locateCinema(
  db: Database,
  cinemaId: string,
  location: {
    latitude: number;
    longitude: number;
    postcode: string | null;
    address: string | null;
  },
) {
  await db.execute(
    `UPDATE cinemas
       SET latitude = $1, longitude = $2,
           postcode = COALESCE(postcode, $3),
           address = COALESCE(address, $4),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
    [location.latitude, location.longitude, location.postcode, location.address, cinemaId],
  );
}

export async function readUnlocatedCinemas(db: Database, source: string) {
  const rows = await db.query<CinemaRow>(
    `SELECT id, source, site_id AS "siteId", name, chain, address, postcode,
              latitude, longitude, booking_url AS "bookingUrl"
       FROM cinemas
       WHERE source = $1 AND (latitude IS NULL OR longitude IS NULL)`,
    [source],
  );

  return rows.rows;
}

export async function readCinemasBySource(db: Database, source: string) {
  const rows = await db.query<CinemaRow>(
    `SELECT id, source, site_id AS "siteId", name, chain, address, postcode,
              latitude, longitude, booking_url AS "bookingUrl"
       FROM cinemas
       WHERE source = $1
       ORDER BY name`,
    [source],
  );

  return rows.rows;
}

export async function readNearbyCinemas(
  db: Database,
  origin: { latitude: number; longitude: number },
  radiusKm: number,
  limit = 24,
) {
  const box = boundingBox(origin, radiusKm);
  const rows = await db.query<CinemaRow>(
    `SELECT id, source, site_id AS "siteId", name, chain, address, postcode,
              latitude, longitude, booking_url AS "bookingUrl"
       FROM cinemas
       WHERE latitude BETWEEN $1 AND $2
         AND longitude BETWEEN $3 AND $4`,
    [box.minLatitude, box.maxLatitude, box.minLongitude, box.maxLongitude],
  );

  return rows.rows
    .flatMap((row) => {
      if (row.latitude === null || row.longitude === null) {
        return [];
      }

      const distanceKm = haversineKm(origin, {
        latitude: row.latitude,
        longitude: row.longitude,
      });

      return distanceKm <= radiusKm ? [{ row, distanceKm }] : [];
    })
    .toSorted((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit)
    .map((entry) => toCinema(entry.row, entry.distanceKm));
}

export async function storeFilms(db: Database, source: string, films: SourceFilm[]) {
  if (films.length === 0) {
    return;
  }

  await db.transaction(async (transaction) => {
    for (const film of films) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO cinema_films
             (source, source_film_id, source_title, source_year, runtime_minutes, poster_url, film_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT(source, source_film_id) DO UPDATE SET
             source_title = excluded.source_title,
             source_year = COALESCE(excluded.source_year, cinema_films.source_year),
             runtime_minutes = COALESCE(excluded.runtime_minutes, cinema_films.runtime_minutes),
             poster_url = COALESCE(excluded.poster_url, cinema_films.poster_url),
             film_url = COALESCE(excluded.film_url, cinema_films.film_url)`,
        [
          source,
          film.filmId,
          film.title,
          film.year,
          film.runtimeMinutes,
          film.posterUrl,
          film.filmUrl,
        ],
      );
    }
  });
}

export type UnmatchedFilm = {
  sourceFilmId: string;
  sourceTitle: string;
  sourceYear: number | null;
  runtimeMinutes: number | null;
};

export async function readUnmatchedFilms(db: Database, source: string, limit = 60) {
  const rows = await db.query<UnmatchedFilm>(
    `SELECT source_film_id AS "sourceFilmId", source_title AS "sourceTitle",
              source_year AS "sourceYear", runtime_minutes AS "runtimeMinutes"
       FROM cinema_films
       WHERE source = $1
         AND title_id IS NULL
         AND (matched_at IS NULL OR matched_at < (CURRENT_TIMESTAMP - INTERVAL '7 day'))
       LIMIT $2`,
    [source, limit],
  );

  return rows.rows;
}

export async function recordFilmMatch(
  db: Database,
  source: string,
  sourceFilmId: string,
  match: { titleId: string | null; confidence: number },
) {
  await db.execute(
    `UPDATE cinema_films
       SET title_id = $1, confidence = $2, matched_at = CURRENT_TIMESTAMP
       WHERE source = $3 AND source_film_id = $4`,
    [match.titleId, match.confidence, source, sourceFilmId],
  );

  await db.execute(
    `UPDATE cinema_screenings
       SET title_id = $1
       WHERE source = $2 AND source_film_id = $3`,
    [match.titleId, source, sourceFilmId],
  );
}

async function screeningId(cinemaId: string, source: string, screening: SourceScreening) {
  const key = screening.sourceEventId
    ? `${cinemaId}:${source}:event:${screening.sourceEventId}`
    : `${cinemaId}:${source}:${screening.filmId}:${screening.businessDay}:${screening.startsAt ?? ""}`;

  return hashState(key);
}

export async function replaceScreenings(
  db: Database,
  source: string,
  cinemaId: string,
  screenings: SourceScreening[],
) {
  if (screenings.length === 0) {
    await db.execute(`DELETE FROM cinema_screenings WHERE cinema_id = $1 AND source = $2`, [
      cinemaId,
      source,
    ]);

    return 0;
  }

  const rows = await Promise.all(
    screenings.map(async (screening) => ({
      screening,
      id: await screeningId(cinemaId, source, screening),
    })),
  );
  const chunks: (typeof rows)[] = [];

  for (let index = 0; index < rows.length; index += 50) {
    chunks.push(rows.slice(index, index + 50));
  }

  for (const chunk of chunks) {
    // oxlint-disable-next-line no-await-in-loop
    await db.transaction(async (transaction) => {
      for (const { id, screening } of chunk) {
        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO cinema_screenings
               (id, cinema_id, source, source_film_id, title_id, starts_at,
                business_day, precision, attributes, booking_url)
             VALUES (
               $1, $2, $3, $4,
               (SELECT title_id FROM cinema_films WHERE source = $5 AND source_film_id = $6),
               $7, $8, $9, $10, $11
             )
             ON CONFLICT(id) DO UPDATE SET
               title_id = excluded.title_id,
               starts_at = excluded.starts_at,
               business_day = excluded.business_day,
               precision = excluded.precision,
               attributes = excluded.attributes,
               booking_url = excluded.booking_url,
               fetched_at = CURRENT_TIMESTAMP`,
          [
            id,
            cinemaId,
            source,
            screening.filmId,
            source,
            screening.filmId,
            screening.startsAt,
            screening.businessDay,
            screening.precision,
            JSON.stringify(screening.attributes),
            screening.bookingUrl,
          ],
        );
      }
    });
  }

  await db.execute(
    `DELETE FROM cinema_screenings
       WHERE cinema_id = $1 AND source = $2
         AND id NOT IN (SELECT value FROM jsonb_array_elements_text(CAST($3 AS jsonb)) AS entries(value))`,
    [cinemaId, source, JSON.stringify(rows.map((row) => row.id))],
  );

  return screenings.length;
}

type ScreeningRow = {
  id: string;
  cinemaId: string;
  startsAt: string | null;
  businessDay: string;
  precision: ScreeningPrecision;
  attributes: string;
  bookingUrl: string | null;
};

export async function readScreeningsForTitle(
  db: Database,
  titleId: string,
  cinemaIds: string[],
  horizonDays: number,
) {
  if (cinemaIds.length === 0) {
    return [];
  }

  const placeholders = cinemaIds.map((_, index) => `$${index + 2}`).join(", ");
  const fromParameter = cinemaIds.length + 2;
  const firstDay = utcDay();
  const rows = await db.query<ScreeningRow>(
    `SELECT id, cinema_id AS "cinemaId", starts_at AS "startsAt", business_day AS "businessDay",
              precision, attributes, booking_url AS "bookingUrl"
       FROM cinema_screenings
       WHERE title_id = $1
         AND cinema_id IN (${placeholders})
         AND business_day BETWEEN CAST($${fromParameter} AS date) AND CAST($${fromParameter + 1} AS date)
       ORDER BY business_day, COALESCE(starts_at, business_day)
       LIMIT 400`,
    [titleId, ...cinemaIds, firstDay, addDays(firstDay, Math.max(1, horizonDays))],
  );

  return rows.rows.map((row) => ({
    id: row.id,
    cinemaId: row.cinemaId,
    startsAt: row.startsAt,
    businessDay: row.businessDay,
    precision: row.precision,
    attributes: (() => {
      const parsed = parseJson(row.attributes);

      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    })(),
    bookingUrl: row.bookingUrl,
  }));
}

type LocalShowingRow = {
  titleId: string;
  cinemaCount: number;
  nextStartsAt: string | null;
  days: string;
};

export async function readShowingTitles(
  db: Database,
  cinemaIds: string[],
  horizonDays: number,
  limit = 30,
) {
  if (cinemaIds.length === 0) {
    return [];
  }

  const placeholders = cinemaIds.map((_, index) => `$${index + 1}`).join(", ");
  const fromParameter = cinemaIds.length + 1;
  const limitParameter = fromParameter + 2;
  const firstDay = utcDay();
  const rows = await db.query<LocalShowingRow>(
    `SELECT title_id AS "titleId",
              COUNT(DISTINCT cinema_id) AS "cinemaCount",
              MIN(starts_at) AS "nextStartsAt",
              string_agg(DISTINCT business_day::text, ',' ORDER BY business_day::text) AS days
       FROM cinema_screenings
       WHERE title_id IS NOT NULL
         AND cinema_id IN (${placeholders})
         AND business_day BETWEEN CAST($${fromParameter} AS date) AND CAST($${fromParameter + 1} AS date)
       GROUP BY title_id
       ORDER BY COUNT(DISTINCT cinema_id) DESC, MIN(starts_at) IS NULL, MIN(starts_at), title_id
       LIMIT $${limitParameter}`,
    [...cinemaIds, firstDay, addDays(firstDay, Math.max(1, horizonDays)), limit],
  );

  return rows.rows.map((row) => ({
    titleId: row.titleId,
    cinemaCount: row.cinemaCount,
    nextStartsAt: row.nextStartsAt,
    businessDays: (row.days ?? "").split(",").filter(Boolean).toSorted(),
  }));
}

export async function noteInterest(db: Database, origin: { latitude: number; longitude: number }) {
  await db.execute(
    `INSERT INTO cinema_interest (cell, latitude, longitude)
       VALUES ($1, $2, $3)
       ON CONFLICT(cell) DO UPDATE SET
         hits = cinema_interest.hits + 1,
         last_seen_at = CURRENT_TIMESTAMP`,
    [interestCell(origin), origin.latitude, origin.longitude],
  );
}

export async function readInterestCells(db: Database, limit = 12) {
  const rows = await db.query<{ latitude: number; longitude: number }>(
    `SELECT latitude, longitude
       FROM cinema_interest
       WHERE last_seen_at > (CURRENT_TIMESTAMP - INTERVAL '30 day')
       ORDER BY hits DESC, last_seen_at DESC
       LIMIT $1`,
    [limit],
  );

  return rows.rows;
}

export async function pruneScreenings(db: Database) {
  const result = await db.execute(
    `DELETE FROM cinema_screenings WHERE business_day < (CURRENT_DATE - INTERVAL '1 day')`,
  );

  return result.rowCount;
}

export async function readCinemaCoverage(db: Database) {
  const rows = await db.query<{
    source: string;
    cinemas: number;
    located: number;
    screenings: number;
    matched: number;
    films: number;
  }>(`SELECT c.source,
              COUNT(DISTINCT c.id) AS cinemas,
              SUM(CASE WHEN c.latitude IS NOT NULL THEN 1 ELSE 0 END) AS located,
              (SELECT COUNT(*) FROM cinema_screenings s WHERE s.source = c.source
                 AND s.business_day >= CURRENT_DATE) AS screenings,
              (SELECT COUNT(*) FROM cinema_films f WHERE f.source = c.source
                 AND f.title_id IS NOT NULL) AS matched,
              (SELECT COUNT(*) FROM cinema_films f WHERE f.source = c.source) AS films
       FROM cinemas AS c
       GROUP BY c.source
       ORDER BY c.source`);

  return rows.rows;
}

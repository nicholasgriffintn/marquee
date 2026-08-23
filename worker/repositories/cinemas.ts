import type { Cinema, ScreeningPrecision } from "../../src/domain/cinema.ts";
import type { SourceCinema, SourceFilm, SourceScreening } from "../clients/cinema/types.ts";
import { boundingBox, haversineKm, interestCell } from "../lib/geo.ts";
import { parseJson } from "../lib/values.ts";

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
  db: D1Database,
  source: string,
  chain: string,
  cinemas: SourceCinema[],
) {
  if (cinemas.length === 0) {
    return 0;
  }

  const statements = cinemas.map((cinema) =>
    db
      .prepare(
        `INSERT INTO cinemas
           (id, source, site_id, name, chain, address, postcode, latitude, longitude, booking_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      )
      .bind(
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
      ),
  );

  await db.batch(statements);

  return cinemas.length;
}

export async function locateCinema(
  db: D1Database,
  cinemaId: string,
  location: {
    latitude: number;
    longitude: number;
    postcode: string | null;
    address: string | null;
  },
) {
  await db
    .prepare(
      `UPDATE cinemas
       SET latitude = ?, longitude = ?,
           postcode = COALESCE(postcode, ?),
           address = COALESCE(address, ?),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(location.latitude, location.longitude, location.postcode, location.address, cinemaId)
    .run();
}

export async function readUnlocatedCinemas(db: D1Database, source: string) {
  const rows = await db
    .prepare(
      `SELECT id, source, site_id AS siteId, name, chain, address, postcode,
              latitude, longitude, booking_url AS bookingUrl
       FROM cinemas
       WHERE source = ? AND (latitude IS NULL OR longitude IS NULL)`,
    )
    .bind(source)
    .all<CinemaRow>();

  return rows.results;
}

export async function readCinemasBySource(db: D1Database, source: string) {
  const rows = await db
    .prepare(
      `SELECT id, source, site_id AS siteId, name, chain, address, postcode,
              latitude, longitude, booking_url AS bookingUrl
       FROM cinemas
       WHERE source = ?
       ORDER BY name`,
    )
    .bind(source)
    .all<CinemaRow>();

  return rows.results;
}

export async function readNearbyCinemas(
  db: D1Database,
  origin: { latitude: number; longitude: number },
  radiusKm: number,
  limit = 24,
) {
  const box = boundingBox(origin, radiusKm);
  const rows = await db
    .prepare(
      `SELECT id, source, site_id AS siteId, name, chain, address, postcode,
              latitude, longitude, booking_url AS bookingUrl
       FROM cinemas
       WHERE latitude BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?`,
    )
    .bind(box.minLatitude, box.maxLatitude, box.minLongitude, box.maxLongitude)
    .all<CinemaRow>();

  return rows.results
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
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit)
    .map((entry) => toCinema(entry.row, entry.distanceKm));
}

export async function storeFilms(db: D1Database, source: string, films: SourceFilm[]) {
  if (films.length === 0) {
    return;
  }

  await db.batch(
    films.map((film) =>
      db
        .prepare(
          `INSERT INTO cinema_films
             (source, source_film_id, source_title, source_year, runtime_minutes, poster_url, film_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source, source_film_id) DO UPDATE SET
             source_title = excluded.source_title,
             source_year = COALESCE(excluded.source_year, cinema_films.source_year),
             runtime_minutes = COALESCE(excluded.runtime_minutes, cinema_films.runtime_minutes),
             poster_url = COALESCE(excluded.poster_url, cinema_films.poster_url),
             film_url = COALESCE(excluded.film_url, cinema_films.film_url)`,
        )
        .bind(
          source,
          film.filmId,
          film.title,
          film.year,
          film.runtimeMinutes,
          film.posterUrl,
          film.filmUrl,
        ),
    ),
  );
}

export type UnmatchedFilm = {
  sourceFilmId: string;
  sourceTitle: string;
  sourceYear: number | null;
  runtimeMinutes: number | null;
};

export async function readUnmatchedFilms(db: D1Database, source: string, limit = 60) {
  const rows = await db
    .prepare(
      `SELECT source_film_id AS sourceFilmId, source_title AS sourceTitle,
              source_year AS sourceYear, runtime_minutes AS runtimeMinutes
       FROM cinema_films
       WHERE source = ?
         AND title_id IS NULL
         AND (matched_at IS NULL OR matched_at < datetime('now', '-7 days'))
       LIMIT ?`,
    )
    .bind(source, limit)
    .all<UnmatchedFilm>();

  return rows.results;
}

export async function recordFilmMatch(
  db: D1Database,
  source: string,
  sourceFilmId: string,
  match: { titleId: string | null; confidence: number },
) {
  await db
    .prepare(
      `UPDATE cinema_films
       SET title_id = ?, confidence = ?, matched_at = CURRENT_TIMESTAMP
       WHERE source = ? AND source_film_id = ?`,
    )
    .bind(match.titleId, match.confidence, source, sourceFilmId)
    .run();

  await db
    .prepare(
      `UPDATE cinema_screenings
       SET title_id = ?
       WHERE source = ? AND source_film_id = ?`,
    )
    .bind(match.titleId, source, sourceFilmId)
    .run();
}

export async function replaceScreenings(
  db: D1Database,
  source: string,
  cinemaId: string,
  screenings: SourceScreening[],
) {
  await db
    .prepare(`DELETE FROM cinema_screenings WHERE cinema_id = ? AND source = ?`)
    .bind(cinemaId, source)
    .run();

  if (screenings.length === 0) {
    return 0;
  }

  const chunks: SourceScreening[][] = [];

  for (let index = 0; index < screenings.length; index += 50) {
    chunks.push(screenings.slice(index, index + 50));
  }

  for (const chunk of chunks) {
    // oxlint-disable-next-line no-await-in-loop
    await db.batch(
      chunk.map((screening) =>
        db
          .prepare(
            `INSERT INTO cinema_screenings
               (id, cinema_id, source, source_film_id, title_id, starts_at,
                business_day, precision, attributes, booking_url)
             VALUES (
               ?, ?, ?, ?,
               (SELECT title_id FROM cinema_films WHERE source = ? AND source_film_id = ?),
               ?, ?, ?, ?, ?
             )`,
          )
          .bind(
            crypto.randomUUID(),
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
          ),
      ),
    );
  }

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
  db: D1Database,
  titleId: string,
  cinemaIds: string[],
  horizonDays: number,
) {
  if (cinemaIds.length === 0) {
    return [];
  }

  const placeholders = cinemaIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT id, cinema_id AS cinemaId, starts_at AS startsAt, business_day AS businessDay,
              precision, attributes, booking_url AS bookingUrl
       FROM cinema_screenings
       WHERE title_id = ?
         AND cinema_id IN (${placeholders})
         AND business_day BETWEEN date('now') AND date('now', ?)
       ORDER BY business_day, COALESCE(starts_at, business_day)
       LIMIT 400`,
    )
    .bind(titleId, ...cinemaIds, `+${Math.max(1, horizonDays)} days`)
    .all<ScreeningRow>();

  return rows.results.map((row) => ({
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
  db: D1Database,
  cinemaIds: string[],
  horizonDays: number,
  limit = 30,
) {
  if (cinemaIds.length === 0) {
    return [];
  }

  const placeholders = cinemaIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT title_id AS titleId,
              COUNT(DISTINCT cinema_id) AS cinemaCount,
              MIN(starts_at) AS nextStartsAt,
              group_concat(DISTINCT business_day) AS days
       FROM cinema_screenings
       WHERE title_id IS NOT NULL
         AND cinema_id IN (${placeholders})
         AND business_day BETWEEN date('now') AND date('now', ?)
       GROUP BY title_id
       ORDER BY cinemaCount DESC, nextStartsAt
       LIMIT ?`,
    )
    .bind(...cinemaIds, `+${Math.max(1, horizonDays)} days`, limit)
    .all<LocalShowingRow>();

  return rows.results.map((row) => ({
    titleId: row.titleId,
    cinemaCount: row.cinemaCount,
    nextStartsAt: row.nextStartsAt,
    businessDays: (row.days ?? "").split(",").filter(Boolean).sort(),
  }));
}

export async function noteInterest(
  db: D1Database,
  origin: { latitude: number; longitude: number },
) {
  await db
    .prepare(
      `INSERT INTO cinema_interest (cell, latitude, longitude)
       VALUES (?, ?, ?)
       ON CONFLICT(cell) DO UPDATE SET
         hits = cinema_interest.hits + 1,
         last_seen_at = CURRENT_TIMESTAMP`,
    )
    .bind(interestCell(origin), origin.latitude, origin.longitude)
    .run();
}

export async function readInterestCells(db: D1Database, limit = 12) {
  const rows = await db
    .prepare(
      `SELECT latitude, longitude
       FROM cinema_interest
       WHERE last_seen_at > datetime('now', '-30 days')
       ORDER BY hits DESC, last_seen_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ latitude: number; longitude: number }>();

  return rows.results;
}

export async function pruneScreenings(db: D1Database) {
  const result = await db
    .prepare(`DELETE FROM cinema_screenings WHERE business_day < date('now', '-1 day')`)
    .run();

  return result.meta.changes;
}

export async function readCinemaCoverage(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT c.source,
              COUNT(DISTINCT c.id) AS cinemas,
              SUM(CASE WHEN c.latitude IS NOT NULL THEN 1 ELSE 0 END) AS located,
              (SELECT COUNT(*) FROM cinema_screenings s WHERE s.source = c.source
                 AND s.business_day >= date('now')) AS screenings,
              (SELECT COUNT(*) FROM cinema_films f WHERE f.source = c.source
                 AND f.title_id IS NOT NULL) AS matched,
              (SELECT COUNT(*) FROM cinema_films f WHERE f.source = c.source) AS films
       FROM cinemas AS c
       GROUP BY c.source
       ORDER BY c.source`,
    )
    .all<{
      source: string;
      cinemas: number;
      located: number;
      screenings: number;
      matched: number;
      films: number;
    }>();

  return rows.results;
}

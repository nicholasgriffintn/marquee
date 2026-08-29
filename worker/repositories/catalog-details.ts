import type { MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, insertRows, queryChunked } from "./catalog-array-utils.ts";

type DetailsRow = {
  titleId: string;
  homepage: string | null;
  trailerKey: string | null;
  tagline: string | null;
  budget: number | null;
  episodeCount: number | null;
  lastAirDate: string | null;
  nextAirDate: string | null;
  pending: number | null;
};

export async function readDetailsMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<DetailsRow>(
        `SELECT title_id AS "titleId", homepage, trailer_key AS "trailerKey", tagline, budget,
                episode_count AS "episodeCount", last_air_date AS "lastAirDate",
                next_air_date AS "nextAirDate", pending
         FROM catalog_title_details
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})`,
        [...wave],
      )
      .then((result) => result.rows),
  );

  return new Map(
    rows.map(({ titleId, pending, ...rest }) => [
      titleId,
      { ...rest, pending: pending === null ? undefined : Boolean(pending) },
    ]),
  );
}

export async function writeDetailsRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_details",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title): DatabaseValue[][] => {
    const hasAny =
      title.homepage ??
      title.trailerKey ??
      title.tagline ??
      title.budget ??
      title.episodeCount ??
      title.lastAirDate ??
      title.nextAirDate ??
      title.pending;

    return hasAny === undefined || hasAny === null
      ? []
      : [
          [
            title.id,
            title.homepage ?? null,
            title.trailerKey ?? null,
            title.tagline ?? null,
            title.budget ?? null,
            title.episodeCount ?? null,
            title.lastAirDate ?? null,
            title.nextAirDate ?? null,
            title.pending === undefined ? null : title.pending ? 1 : 0,
          ],
        ];
  });

  await insertRows(
    db,
    9,
    10,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_details
         (title_id, homepage, trailer_key, tagline, budget, episode_count,
          last_air_date, next_air_date, pending)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT (title_id) DO UPDATE SET
         homepage = excluded.homepage, trailer_key = excluded.trailer_key,
         tagline = excluded.tagline, budget = excluded.budget,
         episode_count = excluded.episode_count, last_air_date = excluded.last_air_date,
         next_air_date = excluded.next_air_date, pending = excluded.pending`,
  );
}

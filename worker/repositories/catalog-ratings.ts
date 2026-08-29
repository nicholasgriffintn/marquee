import type { MediaTitle } from "../../src/domain/catalog.ts";
import {
  deleteByTitleIds,
  insertRows,
  queryChunked,
  rowPlaceholders,
} from "./catalog-array-utils.ts";

type RatingsRow = NonNullable<MediaTitle["ratings"]> & { titleId: string };

export async function readRatingsMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<RatingsRow>(
        `SELECT title_id AS "titleId", imdb_score AS "imdbScore", imdb_votes AS "imdbVotes",
                rotten_tomatoes AS "rottenTomatoes", metascore, awards, award_wins AS "awardWins",
                box_office AS "boxOffice", anime_score AS "animeScore", anime_votes AS "animeVotes"
         FROM catalog_title_ratings
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")})`,
        [...wave],
      )
      .then((result) => result.rows),
  );

  return new Map(rows.map(({ titleId, ...ratings }) => [titleId, ratings]));
}

export async function writeRatingsRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_ratings",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title): DatabaseValue[][] => {
    const ratings = title.ratings;

    return ratings
      ? [
          [
            title.id,
            ratings.imdbScore,
            ratings.imdbVotes,
            ratings.rottenTomatoes,
            ratings.metascore,
            ratings.awards ?? null,
            ratings.awardWins ?? null,
            ratings.boxOffice ?? null,
            ratings.animeScore ?? null,
            ratings.animeVotes ?? null,
          ],
        ]
      : [];
  });

  await insertRows(
    db,
    10,
    9,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_ratings
         (title_id, imdb_score, imdb_votes, rotten_tomatoes, metascore, awards,
          award_wins, box_office, anime_score, anime_votes)
       VALUES ${rowPlaceholders(chunk.length, 10)}
       ON CONFLICT (title_id) DO UPDATE SET
         imdb_score = excluded.imdb_score, imdb_votes = excluded.imdb_votes,
         rotten_tomatoes = excluded.rotten_tomatoes, metascore = excluded.metascore,
         awards = excluded.awards, award_wins = excluded.award_wins,
         box_office = excluded.box_office, anime_score = excluded.anime_score,
         anime_votes = excluded.anime_votes`,
  );
}

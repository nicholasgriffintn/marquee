import { logError } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";
import { EMBEDDING_MODEL } from "./embeddings.ts";

export type BuildingCounts = {
  titles: number;
  movies: number;
  shows: number;
  people: number;
  seasons: number;
  embeddings: number;
  prints: number;
  printsMirrored: number;
  cinemas: number;
  screenings: number;
  upcoming: number;
};

const EMPTY: BuildingCounts = {
  titles: 0,
  movies: 0,
  shows: 0,
  people: 0,
  seasons: 0,
  embeddings: 0,
  prints: 0,
  printsMirrored: 0,
  cinemas: 0,
  screenings: 0,
  upcoming: 0,
};

export async function readBuilding(env: Bindings) {
  try {
    const row = await env.DB.first<BuildingCounts>(
      `SELECT
         tt.titles, tt.movies, tt.shows,
         (SELECT count(*) FROM catalog_people) AS people,
         (SELECT count(*) FROM catalog_seasons) AS seasons,
         (SELECT count(*) FROM title_embeddings
           WHERE content_hash IS NOT NULL AND model = $1) AS embeddings,
         (SELECT count(*) FROM title_schedule WHERE airs_at >= CURRENT_TIMESTAMP) AS upcoming,
         (SELECT count(*) FROM cinemas WHERE latitude IS NOT NULL) AS cinemas,
         (SELECT count(*) FROM cinema_screenings WHERE business_day >= CURRENT_DATE) AS screenings,
         rv.prints, rv."printsMirrored"
       FROM
         (SELECT
            count(*) AS titles,
            sum(CASE WHEN media_type = 'movie' THEN 1 ELSE 0 END) AS movies,
            sum(CASE WHEN media_type = 'tv' THEN 1 ELSE 0 END) AS shows
          FROM catalog_titles) AS tt,
         (SELECT
            sum(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS prints,
            sum(CASE WHEN mirror_state = 'mirrored' THEN 1 ELSE 0 END) AS "printsMirrored"
          FROM revival_works) AS rv`,
      [EMBEDDING_MODEL],
    );

    return { counts: { ...EMPTY, ...row }, fetchedAt: new Date().toISOString() };
  } catch (error) {
    logError("building_read_failed", error, { area: "catalogue" });

    return { counts: EMPTY, fetchedAt: new Date().toISOString() };
  }
}

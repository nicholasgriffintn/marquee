import { mutedGenreList } from "../../src/domain/genres.ts";
import { DEFAULT_PREFERRED_LANGUAGE, preferredLanguage } from "../../src/domain/languages.ts";
import { parseJson } from "../lib/values.ts";

export type NotebookPreferences = {
  preferredCinemaId: string | null;
  preferredCinemaName: string | null;
  preferredLocation: string;
  preferredLanguage: string;
  mutedGenres: string[];
};

const EMPTY_PREFERENCES: NotebookPreferences = {
  preferredCinemaId: null,
  preferredCinemaName: null,
  preferredLocation: "",
  preferredLanguage: DEFAULT_PREFERRED_LANGUAGE,
  mutedGenres: [],
};

export async function readNotebookPreferences(
  db: Database,
  viewerId: string,
): Promise<NotebookPreferences> {
  const row = await db.first<{
    preferredCinemaId: string | null;
    preferredCinemaName: string | null;
    preferredLocation: string | null;
    preferredLanguage: string | null;
    mutedGenres: string | null;
  }>(
    `SELECT p.preferred_cinema_id AS "preferredCinemaId",
            c.name AS "preferredCinemaName",
            p.preferred_location AS "preferredLocation",
            p.preferred_language AS "preferredLanguage",
            p.muted_genres AS "mutedGenres"
       FROM viewer_preferences AS p
       LEFT JOIN cinemas AS c ON c.id = p.preferred_cinema_id
      WHERE p.viewer_id = $1`,
    [viewerId],
  );

  return row
    ? {
        preferredCinemaId: row.preferredCinemaId,
        preferredCinemaName: row.preferredCinemaName,
        preferredLocation: row.preferredLocation ?? "",
        preferredLanguage: preferredLanguage(row.preferredLanguage),
        mutedGenres: mutedGenreList(parseJson(row.mutedGenres ?? "")),
      }
    : EMPTY_PREFERENCES;
}

export async function readPreferredLanguage(db: Database, viewerId: string) {
  if (!viewerId) {
    return DEFAULT_PREFERRED_LANGUAGE;
  }

  const row = await db.first<{ preferredLanguage: string | null }>(
    `SELECT preferred_language AS "preferredLanguage" FROM viewer_preferences WHERE viewer_id = $1`,
    [viewerId],
  );

  return preferredLanguage(row?.preferredLanguage);
}

export async function saveNotebookPreferences(
  db: Database,
  viewerId: string,
  input: {
    preferredCinemaId: string | null;
    preferredLocation: string | null;
    preferredLanguage: string;
    mutedGenres: string[];
  },
) {
  await db.execute(
    `INSERT INTO viewer_preferences
         (viewer_id, preferred_cinema_id, preferred_location, preferred_language, muted_genres)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(viewer_id) DO UPDATE SET
         preferred_cinema_id = excluded.preferred_cinema_id,
         preferred_location = excluded.preferred_location,
         preferred_language = excluded.preferred_language,
         muted_genres = excluded.muted_genres,
         updated_at = CURRENT_TIMESTAMP`,
    [
      viewerId,
      input.preferredCinemaId,
      input.preferredLocation,
      input.preferredLanguage,
      JSON.stringify(mutedGenreList(input.mutedGenres)),
    ],
  );
}

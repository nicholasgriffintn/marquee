import { DEFAULT_PREFERRED_LANGUAGE, preferredLanguage } from "../../src/domain/languages.ts";

export type NotebookPreferences = {
  preferredCinemaId: string | null;
  preferredCinemaName: string | null;
  preferredLocation: string;
  preferredLanguage: string;
};

const EMPTY_PREFERENCES: NotebookPreferences = {
  preferredCinemaId: null,
  preferredCinemaName: null,
  preferredLocation: "",
  preferredLanguage: DEFAULT_PREFERRED_LANGUAGE,
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
  }>(
    `SELECT p.preferred_cinema_id AS "preferredCinemaId",
            c.name AS "preferredCinemaName",
            p.preferred_location AS "preferredLocation",
            p.preferred_language AS "preferredLanguage"
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
      }
    : EMPTY_PREFERENCES;
}

export async function saveNotebookPreferences(
  db: Database,
  viewerId: string,
  input: {
    preferredCinemaId: string | null;
    preferredLocation: string | null;
    preferredLanguage: string;
  },
) {
  await db.execute(
    `INSERT INTO viewer_preferences
         (viewer_id, preferred_cinema_id, preferred_location, preferred_language)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(viewer_id) DO UPDATE SET
         preferred_cinema_id = excluded.preferred_cinema_id,
         preferred_location = excluded.preferred_location,
         preferred_language = excluded.preferred_language,
         updated_at = CURRENT_TIMESTAMP`,
    [viewerId, input.preferredCinemaId, input.preferredLocation, input.preferredLanguage],
  );
}

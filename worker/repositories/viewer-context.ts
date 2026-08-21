import { validProviderIds } from "../lib/validation.ts";
import { parseJson } from "../lib/values.ts";
import type { EntryStatus, ViewingContext } from "../types.ts";

type EntryRow = {
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  thoughts: string;
};

type PreferenceRow = { selectedProviderIds: string };

export async function readViewerContext(db: D1Database, viewerId: string) {
  const [entriesResult, preference] = await Promise.all([
    db
      .prepare(
        `SELECT title_id AS titleId, status, rating, thoughts FROM viewing_entries WHERE viewer_id = ? ORDER BY updated_at DESC LIMIT 100`,
      )
      .bind(viewerId)
      .all<EntryRow>(),
    db
      .prepare(
        `SELECT selected_provider_ids AS selectedProviderIds FROM viewer_preferences WHERE viewer_id = ? LIMIT 1`,
      )
      .bind(viewerId)
      .first<PreferenceRow>(),
  ]);
  const entries: ViewingContext[] = entriesResult.results.map((entry) => ({
    titleId: entry.titleId,
    status: entry.status,
    rating: entry.rating,
    thoughts: entry.thoughts.slice(0, 500),
  }));

  return {
    entries,
    selectedProviderIds: preference
      ? validProviderIds(parseJson(preference.selectedProviderIds))
      : [],
  };
}

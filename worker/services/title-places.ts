import { readTitlePlaces, type PlaceRef } from "../clients/wikidata-places.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { readPlaceCandidates, writeTitlePlaces } from "../repositories/title-places.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 120;
const WAVE = 30;
const REFRESH_DAYS = 90;
const RETRY_DAYS = 30;

export async function syncTitlePlaces(env: Bindings) {
  const candidates = await readPlaceCandidates(env.DB, SAMPLE_SIZE, REFRESH_DAYS, RETRY_DAYS);

  if (candidates.length === 0) {
    return 0;
  }

  let placed = 0;
  let covered = 0;

  for (let index = 0; index < candidates.length; index += WAVE) {
    const wave = candidates.slice(index, index + WAVE);
    const refs = wave.map((row): PlaceRef => ({
      key: row.titleId,
      wikidataId: row.wikidataId,
      mediaType: row.mediaType,
      tmdbId: row.tmdbId,
    }));

    try {
      // oxlint-disable-next-line no-await-in-loop
      const found = await readTitlePlaces(refs);
      // oxlint-disable-next-line no-await-in-loop
      const written = await writeTitlePlaces(
        env.DB,
        wave.map((row) => row.titleId),
        found.rows,
        found.countries,
      );

      placed += written;
      covered += new Set(found.rows.map((row) => row.key)).size;
    } catch (error) {
      logError("title_places_wave_failed", error, { titles: wave.length });
    }
  }

  logEvent("title_places_synced", {
    candidates: candidates.length,
    covered,
    placed,
  });

  return covered;
}

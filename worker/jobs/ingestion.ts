import { getCatalog, getItems } from "../clients/tmdb.ts";
import { getWatchmodeAvailability } from "../clients/watchmode.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { enrichAvailability } from "../repositories/availability.ts";
import { storeCatalog, storeItems } from "../repositories/catalog-writer.ts";
import { storeProviders } from "../repositories/providers.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import { getProviderLedger } from "./provider-ledger.ts";

type SavedTitleRow = { titleId: string };

async function syncCatalog(env: Bindings) {
  const catalogue = await getCatalog(env, "", []);
  const catalogueTitles = await storeCatalog(env.DB, catalogue);
  const savedTitles = await env.DB.prepare(
    `SELECT DISTINCT title_id AS titleId
     FROM viewing_entries
     ORDER BY updated_at DESC
     LIMIT 100`,
  ).all<SavedTitleRow>();
  const catalogueIds = new Set(catalogueTitles.map((title) => title.id));
  const missingSavedIds = savedTitles.results
    .map((row) => row.titleId)
    .filter((id) => isKnownTitle(id) && !catalogueIds.has(id));
  const missingSavedTitles = await getItems(env, missingSavedIds);

  await storeItems(env.DB, missingSavedTitles, catalogue.fetchedAt);

  if (env.WATCHMODE_API_KEY) {
    const titleIds = [...catalogueTitles, ...missingSavedTitles].map((title) => title.id);

    await env.INGESTION_QUEUE.sendBatch(
      [...new Set(titleIds)].map((titleId) => ({
        body: { type: "enrich-availability", titleId },
        contentType: "json",
      })),
    );
  }
}

async function enrichTitleAvailability(env: Bindings, titleId: string) {
  if (!env.WATCHMODE_API_KEY) {
    return;
  }

  const match = /^(movie|tv):(\d+)$/u.exec(titleId);

  if (!match) {
    return;
  }

  const mediaType = match[1] === "movie" ? "movie" : "tv";
  const availability = await getWatchmodeAvailability(env, mediaType, Number(match[2]));

  await enrichAvailability(env.DB, titleId, availability);
}

export async function executeIngestionJob(env: Bindings, job: IngestionJob) {
  if (job.type === "sync-providers") {
    const providers = await getProviderLedger(env);

    await storeProviders(env.DB, providers);

    return;
  }

  if (job.type === "sync-catalog") {
    await syncCatalog(env);

    return;
  }

  await enrichTitleAvailability(env, job.titleId);
}

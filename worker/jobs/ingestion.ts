import { getCatalog, getDiscoverPage, getItems } from "../clients/tmdb.ts";
import { logEvent } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { claimBudget } from "../repositories/budgets.ts";
import { storeCatalog, storeItems } from "../repositories/catalog-writer.ts";
import { readPartition, recordPageDrained } from "../repositories/discover.ts";
import { storeProviders } from "../repositories/providers.ts";
import { syncBuzz } from "../services/buzz.ts";
import { syncCinemaDirectory, syncCinemaScreenings } from "../services/cinema-sync.ts";
import { advanceDiscoverFrontier, measureDiscoverPartition } from "../services/discover.ts";
import { embedTitles } from "../services/embeddings.ts";
import { groupRevivalPrints } from "../services/revival-groups.ts";
import { mirrorWork } from "../services/revival-mirror.ts";
import { checkRevivalRights } from "../services/revival-rights.ts";
import {
  matchRevivalWorks,
  recheckArchiveWorks,
  syncArchiveCollection,
  syncEuropeanaCountry,
  syncScreeningRoom,
} from "../services/revival.ts";
import { syncSchedule } from "../services/schedule.ts";
import { buildSections } from "../services/sections.ts";
import { exportTraktShelf, importTraktHistory } from "../services/trakt.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import { importAnimeIds } from "./anime-ids.ts";
import { enrichTitleAvailability, queueAvailability } from "./availability.ts";
import { queueEmbeddings } from "./embeddings.ts";
import { enrichAnime, enrichRatings, queueEnrichment } from "./enrichment.ts";
import { importDiaryRow, importImdbTitle } from "./imports.ts";
import { cachePoster } from "./posters.ts";
import { getProviderLedger } from "./provider-ledger.ts";
import { withRateLimitPause } from "./sources.ts";

export { queueAvailability, queueStaleAvailability } from "./availability.ts";
export { queueEmbeddings } from "./embeddings.ts";
export { queueEnrichment } from "./enrichment.ts";

const SAVED_TITLE_SAMPLE = 100;

export async function syncCatalogHead(env: Bindings) {
  const catalogue = await getCatalog(env, "", []);
  const catalogueTitles = await storeCatalog(env.DB, catalogue);
  const savedTitles = await env.DB.prepare(
    `SELECT DISTINCT title_id AS titleId
     FROM viewing_entries
     ORDER BY updated_at DESC
     LIMIT ?`,
  )
    .bind(SAVED_TITLE_SAMPLE)
    .all<{ titleId: string }>();
  const catalogueIds = new Set(catalogueTitles.map((title) => title.id));
  const missingSavedIds = savedTitles.results
    .map((row) => row.titleId)
    .filter((id) => isKnownTitle(id) && !catalogueIds.has(id));
  const missingSavedTitles = await getItems(env, missingSavedIds);

  await storeItems(env.DB, missingSavedTitles, catalogue.fetchedAt);

  return [
    ...catalogueTitles.map((title) => title.id),
    ...savedTitles.results.map((row) => row.titleId).filter(isKnownTitle),
  ];
}

async function syncCatalog(env: Bindings) {
  const titleIds = await syncCatalogHead(env);

  await advanceDiscoverFrontier(env);
  await queueAvailability(env, titleIds);
  await queueEnrichment(env);
  await queueEmbeddings(env);
}

async function syncDiscoverPage(
  env: Bindings,
  mediaType: "movie" | "tv",
  page: number,
  id: string | null,
) {
  const partition = id ? await readPartition(env.DB, id) : null;

  if (id && !partition) {
    return;
  }

  if (!(await claimBudget(env, "tmdb"))) {
    logEvent("budget_exhausted", { source: "tmdb", partition: id });

    return;
  }

  const window = partition ? { startDate: partition.startDate, endDate: partition.endDate } : null;
  const titles = await withRateLimitPause(env, "tmdb", () =>
    getDiscoverPage(env, mediaType, page, window),
  );

  if (titles.limited) {
    return;
  }

  await storeItems(env.DB, titles.value, new Date().toISOString());

  if (partition) {
    await recordPageDrained(env.DB, partition.id);
  }
}

async function syncRevivalSource(
  env: Bindings,
  job: IngestionJob & { type: "sync-revival-source" },
) {
  const collection =
    job.source === "europeana"
      ? (job.collection ?? "United Kingdom")
      : (job.collection ?? "feature_films");
  const run =
    job.source === "loc"
      ? await syncScreeningRoom(env)
      : job.source === "europeana"
        ? await syncEuropeanaCountry(env, collection)
        : await syncArchiveCollection(env, collection);

  if (!job.chain || run.exhausted) {
    return;
  }

  await env.REVIVAL_QUEUE.send({
    type: "sync-revival-source",
    source: job.source,
    ...(job.source === "loc" ? {} : { collection }),
    chain: true,
  });
}

export async function executeIngestionJob(env: Bindings, job: IngestionJob) {
  switch (job.type) {
    case "sync-providers": {
      await storeProviders(env.DB, await getProviderLedger(env));

      return;
    }

    case "sync-catalog": {
      await syncCatalog(env);

      return;
    }

    case "sync-discover-page": {
      await syncDiscoverPage(env, job.mediaType, job.page, job.partitionId ?? null);

      return;
    }

    case "measure-discover-partition": {
      await measureDiscoverPartition(env, job.partitionId);

      return;
    }

    case "enrich-ratings": {
      await enrichRatings(env, job.titleId);

      return;
    }

    case "enrich-anime":
    case "enrich-anilist": {
      await enrichAnime(env, job.titleId);

      return;
    }

    case "import-anime-ids": {
      const run = await importAnimeIds(env, job.offset ?? 0, job.force ?? false);

      if (!run.done) {
        await env.ANIME_QUEUE.send({ type: "import-anime-ids", offset: run.reached });
      }

      return;
    }

    case "enrich-availability": {
      await enrichTitleAvailability(env, job.titleId);

      return;
    }

    case "cache-poster": {
      await cachePoster(env, job.titleId);

      return;
    }

    case "import-imdb-title": {
      await importImdbTitle(env, job.imdbId);

      return;
    }

    case "import-diary-row": {
      await importDiaryRow(env, job);

      return;
    }

    case "sync-schedule": {
      await syncSchedule(env);

      return;
    }

    case "sync-buzz": {
      await syncBuzz(env);

      return;
    }

    case "sync-cinemas": {
      await syncCinemaDirectory(env, job.source);

      return;
    }

    case "sync-cinema-screenings": {
      await syncCinemaScreenings(env, job.source, job.siteId);

      return;
    }

    case "sync-revival-source": {
      await syncRevivalSource(env, job);

      return;
    }

    case "match-revival-works": {
      const run = await matchRevivalWorks(env);

      if (job.chain && !run.exhausted) {
        await env.REVIVAL_QUEUE.send({ type: "match-revival-works", chain: true });
      }

      return;
    }

    case "group-revival-prints": {
      await groupRevivalPrints(env);

      return;
    }

    case "check-revival-rights": {
      await checkRevivalRights(env);

      return;
    }

    case "recheck-revival-works": {
      const run = await recheckArchiveWorks(env);

      if (job.chain && !run.exhausted) {
        await env.REVIVAL_QUEUE.send({ type: "recheck-revival-works", chain: true });
      }

      return;
    }

    case "mirror-revival-work": {
      const result = await mirrorWork(env, job.workId);

      if (!result.done) {
        await env.REVIVAL_QUEUE.send({ type: "mirror-revival-work", workId: job.workId });
      }

      return;
    }

    case "build-sections": {
      await buildSections(env);

      return;
    }

    case "import-trakt-history": {
      await importTraktHistory(env, job.viewerId, job.origin);

      return;
    }

    case "push-trakt-shelf": {
      await exportTraktShelf(env, job.viewerId, job.origin);

      return;
    }

    case "embed-titles": {
      await embedTitles(env, job.titleIds);
    }
  }
}

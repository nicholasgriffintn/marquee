import type { MediaType } from "../../src/domain/catalog.ts";
import { getAnilistDetails } from "../clients/anilist.ts";
import { getJustwatchAvailability } from "../clients/justwatch.ts";
import { getOmdbPoster, getOmdbRatings } from "../clients/omdb.ts";
import { getSimklIds } from "../clients/simkl.ts";
import {
  findByImdbId,
  getCatalog,
  getDiscoverPage,
  getDiscoverPageCount,
  getItems,
} from "../clients/tmdb.ts";
import { getWatchmodeAvailability } from "../clients/watchmode.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { enrichAvailability } from "../repositories/availability.ts";
import { claimBudget, isRateLimited, pauseSource } from "../repositories/budgets.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { storeCatalog, storeItems } from "../repositories/catalog-writer.ts";
import {
  selectAnilistCandidates,
  selectUnenriched,
  storeEnrichment,
  storePoster,
} from "../repositories/enrichment.ts";
import { storeProviders } from "../repositories/providers.ts";
import { syncBuzz } from "../services/buzz.ts";
import { embedTitles, selectUnembedded } from "../services/embeddings.ts";
import { syncSchedule } from "../services/schedule.ts";
import { buildSections } from "../services/sections.ts";
import { importTraktHistory } from "../services/trakt.ts";
import type { Bindings, EnrichmentSource, IngestionJob } from "../types.ts";
import { getProviderLedger } from "./provider-ledger.ts";

type SavedTitleRow = { titleId: string };

const AVAILABILITY_MAX_AGE_DAYS = 7;
const AVAILABILITY_PER_RUN = 400;
const QUEUE_BATCH = 100;
const EMBED_JOB_SIZE = 25;
const EMBED_PER_RUN = 2_000;
const MIN_POSTER_BYTES = 40_000;

const RATE_LIMIT_PAUSE_MINUTES: Partial<Record<EnrichmentSource, number>> = {
  simkl: 60,
  anilist: 60,
  watchmode: 24 * 60,
};

const ENRICHERS = [
  { source: "omdb", job: "enrich-ratings", maxAgeDays: 30, perRun: 900 },
  { source: "simkl", job: "enrich-simkl", maxAgeDays: 90, perRun: 120 },
  { source: "poster", job: "cache-poster", maxAgeDays: 365, perRun: 2_000 },
  { source: "anilist", job: "enrich-anilist", maxAgeDays: 14, perRun: 400 },
] as const satisfies readonly {
  source: EnrichmentSource;
  job: IngestionJob["type"];
  maxAgeDays: number;
  perRun: number;
}[];

function enrichmentQueue(env: Bindings, source: EnrichmentSource) {
  if (source === "omdb") {
    return env.RATINGS_QUEUE;
  }

  if (source === "poster") {
    return env.POSTER_QUEUE;
  }

  return env.SIMKL_QUEUE;
}

function sourceCandidates(
  env: Bindings,
  source: EnrichmentSource,
  maxAgeDays: number,
  perRun: number,
) {
  return source === "anilist"
    ? selectAnilistCandidates(env, maxAgeDays, perRun)
    : selectUnenriched(env, source, maxAgeDays, perRun);
}

function sourceConfigured(env: Bindings, source: EnrichmentSource) {
  if (source === "omdb" || source === "poster") {
    return Boolean(env.OMDB_API_KEY);
  }

  if (source === "anilist") {
    return true;
  }

  return Boolean(env.SIMKL_CLIENT_ID);
}

async function withRateLimitPause<T>(
  env: Bindings,
  source: EnrichmentSource,
  run: () => Promise<T>,
) {
  try {
    return await run();
  } catch (error) {
    if (!isRateLimited(error)) {
      throw error;
    }

    await pauseSource(env, source, RATE_LIMIT_PAUSE_MINUTES[source] ?? 30);

    return null;
  }
}

function titleParts(titleId: string) {
  const match = /^(movie|tv):(\d+)$/u.exec(titleId);

  return match
    ? {
        mediaType: match[1] === "movie" ? ("movie" as const) : ("tv" as const),
        tmdbId: Number(match[2]),
      }
    : null;
}

export async function syncCatalogHead(env: Bindings) {
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

  return [
    ...catalogueTitles.map((title) => title.id),
    ...savedTitles.results.map((row) => row.titleId).filter(isKnownTitle),
  ];
}

export async function queueDiscoverPages(env: Bindings) {
  const [moviePages, televisionPages] = await Promise.all([
    getDiscoverPageCount(env, "movie"),
    getDiscoverPageCount(env, "tv"),
  ]);
  const pageJobs: IngestionJob[] = [
    ...Array.from({ length: moviePages }, (_, index): IngestionJob => ({
      type: "sync-discover-page",
      mediaType: "movie",
      page: index + 1,
    })),
    ...Array.from({ length: televisionPages }, (_, index): IngestionJob => ({
      type: "sync-discover-page",
      mediaType: "tv",
      page: index + 1,
    })),
  ];

  console.log(JSON.stringify({ event: "discover_sweep_queued", moviePages, televisionPages }));

  await enqueue(env.INGESTION_QUEUE, pageJobs);

  return { moviePages, televisionPages };
}

async function syncCatalog(env: Bindings) {
  const titleIds = await syncCatalogHead(env);

  await queueDiscoverPages(env);
  await queueAvailability(env, titleIds);
  await queueEnrichment(env);
  await queueEmbeddings(env);
}

export async function queueEmbeddings(env: Bindings) {
  const titleIds = await selectUnembedded(env, EMBED_PER_RUN);
  const jobs: IngestionJob[] = [];

  for (let index = 0; index < titleIds.length; index += EMBED_JOB_SIZE) {
    jobs.push({ type: "embed-titles", titleIds: titleIds.slice(index, index + EMBED_JOB_SIZE) });
  }

  console.log(JSON.stringify({ event: "embeddings_queued", titles: titleIds.length }));

  await enqueue(env.EMBEDDING_QUEUE, jobs);
}

export async function queueStaleAvailability(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT id AS titleId
     FROM catalog_titles
     WHERE enriched_at IS NULL OR enriched_at < datetime('now', ?)
     ORDER BY (enriched_at IS NOT NULL), popularity DESC
     LIMIT ?`,
  )
    .bind(`-${AVAILABILITY_MAX_AGE_DAYS} days`, AVAILABILITY_PER_RUN)
    .all<SavedTitleRow>();
  const titleIds = rows.results.map((row) => row.titleId).filter(isKnownTitle);

  console.log(JSON.stringify({ event: "availability_backfill_queued", count: titleIds.length }));

  await enqueue(
    env.AVAILABILITY_QUEUE,
    titleIds.map((titleId): IngestionJob => ({ type: "enrich-availability", titleId })),
  );

  return titleIds.length;
}

export async function queueEnrichment(env: Bindings) {
  for (const enricher of ENRICHERS) {
    if (!sourceConfigured(env, enricher.source)) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await sourceCandidates(
      env,
      enricher.source,
      enricher.maxAgeDays,
      enricher.perRun,
    );

    console.log(
      JSON.stringify({
        event: "enrichment_queued",
        source: enricher.source,
        count: titleIds.length,
      }),
    );

    // oxlint-disable-next-line no-await-in-loop
    await enqueue(
      enrichmentQueue(env, enricher.source),
      titleIds.map((titleId): IngestionJob => ({ type: enricher.job, titleId })),
    );
  }
}

async function syncDiscoverPage(env: Bindings, mediaType: "movie" | "tv", page: number) {
  const titles = await getDiscoverPage(env, mediaType, page);

  await storeItems(env.DB, titles, new Date().toISOString());
}

async function queueTitleEmbeddings(env: Bindings, titleIds: string[]) {
  const unique = [...new Set(titleIds)];

  if (unique.length === 0) {
    return;
  }

  const jobs: IngestionJob[] = [];

  for (let index = 0; index < unique.length; index += EMBED_JOB_SIZE) {
    jobs.push({ type: "embed-titles", titleIds: unique.slice(index, index + EMBED_JOB_SIZE) });
  }

  await enqueue(env.EMBEDDING_QUEUE, jobs);
}

export async function queueAvailability(env: Bindings, titleIds: string[]) {
  if (titleIds.length === 0) {
    return;
  }

  const unique = [...new Set(titleIds)];
  const placeholders = unique.map(() => "?").join(", ");
  const fresh = await env.DB.prepare(
    `SELECT id AS titleId
     FROM catalog_titles
     WHERE id IN (${placeholders})
       AND enriched_at IS NOT NULL
       AND enriched_at > datetime('now', ?)`,
  )
    .bind(...unique, `-${AVAILABILITY_MAX_AGE_DAYS} days`)
    .all<SavedTitleRow>();
  const skip = new Set(fresh.results.map((row) => row.titleId));

  await enqueue(
    env.AVAILABILITY_QUEUE,
    unique
      .filter((titleId) => !skip.has(titleId))
      .map((titleId): IngestionJob => ({ type: "enrich-availability", titleId })),
  );
}

async function enqueue(queue: Queue<IngestionJob>, jobs: IngestionJob[]) {
  for (let index = 0; index < jobs.length; index += QUEUE_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    await queue.sendBatch(
      jobs.slice(index, index + QUEUE_BATCH).map((body) => ({ body, contentType: "json" })),
    );
  }
}

async function isSavedTitle(env: Bindings, titleId: string) {
  const row = await env.DB.prepare(
    `SELECT 1 AS saved FROM viewing_entries WHERE title_id = ? LIMIT 1`,
  )
    .bind(titleId)
    .first<{ saved: number }>();

  return Boolean(row);
}

async function watchmodeAvailability(
  env: Bindings,
  titleId: string,
  mediaType: MediaType,
  tmdbId: number,
) {
  if (!env.WATCHMODE_API_KEY || !(await isSavedTitle(env, titleId))) {
    return [];
  }

  if (!(await claimBudget(env, "watchmode"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "watchmode", titleId }));

    return [];
  }

  return (
    (await withRateLimitPause(env, "watchmode", () =>
      getWatchmodeAvailability(env, mediaType, tmdbId),
    )) ?? []
  );
}

async function enrichTitleAvailability(env: Bindings, titleId: string) {
  const parts = titleParts(titleId);

  if (!parts) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    return;
  }

  if (!(await claimBudget(env, "justwatch"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "justwatch", titleId }));

    return;
  }

  const availability = await getJustwatchAvailability(parts.mediaType, parts.tmdbId, title.title);

  await enrichAvailability(
    env.DB,
    titleId,
    availability ?? (await watchmodeAvailability(env, titleId, parts.mediaType, parts.tmdbId)),
  );
}

async function imdbIdFor(env: Bindings, titleId: string) {
  if (!env.OMDB_API_KEY) {
    return null;
  }

  const [title] = await readItems(env.DB, [titleId]);

  return title?.imdbUrl ? (/\/(tt\d+)/u.exec(title.imdbUrl)?.[1] ?? null) : null;
}

async function enrichRatings(env: Bindings, titleId: string) {
  const imdbId = await imdbIdFor(env, titleId);

  if (!imdbId) {
    return;
  }

  if (!(await claimBudget(env, "omdb"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "omdb", titleId }));

    return;
  }

  const ratings = await withRateLimitPause(env, "omdb", () => getOmdbRatings(env, imdbId));

  if (!ratings) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);

  await storeEnrichment(env, titleId, "omdb", {
    ratings: { ...ratings, anilistScore: title?.ratings?.anilistScore ?? null },
  });
}

async function importImdbTitle(env: Bindings, imdbId: string) {
  const titleId = await findByImdbId(env, imdbId);

  if (!titleId) {
    console.log(JSON.stringify({ event: "imdb_import_unmatched", imdbId }));

    return;
  }

  const [title] = await getItems(env, [titleId]);

  if (!title) {
    return;
  }

  await storeItems(env.DB, [title], new Date().toISOString());
  await queueAvailability(env, [titleId]);
  await queueTitleEmbeddings(env, [titleId]);
}

async function originPosterUrl(env: Bindings, titleId: string) {
  const row = await env.DB.prepare(
    `SELECT json_extract(payload, '$.posterUrl') AS posterUrl FROM catalog_titles WHERE id = ?`,
  )
    .bind(titleId)
    .first<{ posterUrl: string | null }>();
  const url = row?.posterUrl ?? null;

  return url?.startsWith("https://image.tmdb.org/")
    ? url.replace(/\/t\/p\/w\d+\//u, "/t/p/w780/")
    : null;
}

async function fetchImage(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.startsWith("image/")) {
    return null;
  }

  const body = await response.arrayBuffer();

  return body.byteLength > 0 ? { body, contentType } : null;
}

async function cachePoster(env: Bindings, titleId: string) {
  const imdbId = await imdbIdFor(env, titleId);

  if (imdbId && (await claimBudget(env, "poster"))) {
    const poster = await getOmdbPoster(env, imdbId);

    if (poster && poster.body.byteLength >= MIN_POSTER_BYTES) {
      await storePoster(env, titleId, poster.body, poster.contentType);

      return;
    }
  }

  const tmdbPoster = await originPosterUrl(env, titleId);
  const fallback = tmdbPoster ? await fetchImage(tmdbPoster) : null;

  if (fallback) {
    await storePoster(env, titleId, fallback.body, fallback.contentType);
  }
}

async function enrichAnilist(env: Bindings, titleId: string) {
  const [title] = await readItems(env.DB, [titleId]);
  const anilistId = title?.externalIds?.anilistId ?? null;

  if (!anilistId) {
    return;
  }

  if (!(await claimBudget(env, "anilist"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "anilist", titleId }));

    return;
  }

  const details = await withRateLimitPause(env, "anilist", () => getAnilistDetails(anilistId));

  if (!details) {
    return;
  }

  const keywords = [
    ...new Set([
      ...(title?.keywords ?? []),
      ...details.tags,
      ...details.studios.map((studio) => studio.toLowerCase()),
    ]),
  ].slice(0, 40);

  await storeEnrichment(env, titleId, "anilist", {
    keywords,
    ratings: {
      imdbScore: title?.ratings?.imdbScore ?? null,
      imdbVotes: title?.ratings?.imdbVotes ?? null,
      rottenTomatoes: title?.ratings?.rottenTomatoes ?? null,
      metascore: title?.ratings?.metascore ?? null,
      awards: title?.ratings?.awards ?? null,
      awardWins: title?.ratings?.awardWins ?? null,
      boxOffice: title?.ratings?.boxOffice ?? null,
      anilistScore: details.score,
    },
  });

  if (details.nextEpisode && title) {
    await env.DB.prepare(
      `INSERT INTO title_schedule
         (id, title_id, imdb_id, show_name, season, episode, episode_name, airs_at, network, source)
       VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, NULL, 'anilist')
       ON CONFLICT(id) DO UPDATE SET
         episode = excluded.episode,
         airs_at = excluded.airs_at,
         fetched_at = CURRENT_TIMESTAMP`,
    )
      .bind(
        `anilist:${anilistId}`,
        titleId,
        title.imdbUrl ? (/\/(tt\d+)/u.exec(title.imdbUrl)?.[1] ?? null) : null,
        title.title,
        details.nextEpisode.episode,
        details.nextEpisode.airsAt,
      )
      .run();
  }
}

async function enrichSimkl(env: Bindings, titleId: string) {
  const parts = env.SIMKL_CLIENT_ID ? titleParts(titleId) : null;

  if (!parts) {
    return;
  }

  if (!(await claimBudget(env, "simkl"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "simkl", titleId }));

    return;
  }

  const externalIds = await withRateLimitPause(env, "simkl", () =>
    getSimklIds(env, parts.mediaType, parts.tmdbId),
  );

  if (externalIds) {
    await storeEnrichment(env, titleId, "simkl", { externalIds });
  }
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

  if (job.type === "sync-discover-page") {
    await syncDiscoverPage(env, job.mediaType, job.page);

    return;
  }

  if (job.type === "enrich-ratings") {
    await enrichRatings(env, job.titleId);

    return;
  }

  if (job.type === "enrich-simkl") {
    await enrichSimkl(env, job.titleId);

    return;
  }

  if (job.type === "enrich-anilist") {
    await enrichAnilist(env, job.titleId);

    return;
  }

  if (job.type === "cache-poster") {
    await cachePoster(env, job.titleId);

    return;
  }

  if (job.type === "import-imdb-title") {
    await importImdbTitle(env, job.imdbId);

    return;
  }

  if (job.type === "sync-schedule") {
    await syncSchedule(env);

    return;
  }

  if (job.type === "sync-buzz") {
    await syncBuzz(env);

    return;
  }

  if (job.type === "build-sections") {
    await buildSections(env);

    return;
  }

  if (job.type === "import-trakt-history") {
    await importTraktHistory(env, job.viewerId, job.origin);

    return;
  }

  if (job.type === "embed-titles") {
    await embedTitles(env, job.titleIds);

    return;
  }

  if (job.type === "enrich-availability") {
    await enrichTitleAvailability(env, job.titleId);
  }
}

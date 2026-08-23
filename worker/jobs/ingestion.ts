import type { MediaType } from "../../src/domain/catalog.ts";
import { getAnilistDetails } from "../clients/anilist.ts";
import { getJustwatchAvailability } from "../clients/justwatch.ts";
import { getOmdbPoster, getOmdbRatings } from "../clients/omdb.ts";
import { getSimklIds } from "../clients/simkl.ts";
import {
  findByImdbId,
  findByTitle,
  getCatalog,
  getDiscoverPage,
  getItems,
} from "../clients/tmdb.ts";
import { getWatchmodeAvailability } from "../clients/watchmode.ts";
import { enqueue } from "../lib/queue.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { enrichAvailability, markAvailabilityChecked } from "../repositories/availability.ts";
import {
  claimBudget,
  isRateLimited,
  pauseSource,
  readBudgetRoom,
} from "../repositories/budgets.ts";
import { readItems, readRawItems } from "../repositories/catalog-reader.ts";
import { storeCatalog, storeItems } from "../repositories/catalog-writer.ts";
import { readPartition, recordPageDrained } from "../repositories/discover.ts";
import {
  selectAnilistCandidates,
  selectUnenriched,
  storeEnrichment,
  storeEnrichmentMiss,
  storePoster,
} from "../repositories/enrichment.ts";
import { storeProviders } from "../repositories/providers.ts";
import {
  countStaleWorkingSet,
  DEMAND_MAX_AGE_DAYS,
  selectStaleWorkingSet,
} from "../repositories/working-set.ts";
import { syncBuzz } from "../services/buzz.ts";
import { syncCinemaDirectory, syncCinemaScreenings } from "../services/cinema-sync.ts";
import { advanceDiscoverFrontier, measureDiscoverPartition } from "../services/discover.ts";
import { embedTitles, selectUnembedded } from "../services/embeddings.ts";
import { syncSchedule } from "../services/schedule.ts";
import { buildSections } from "../services/sections.ts";
import { exportTraktShelf, importTraktHistory } from "../services/trakt.ts";
import type { Bindings, EnrichmentSource, IngestionJob } from "../types.ts";
import { getProviderLedger } from "./provider-ledger.ts";

type SavedTitleRow = { titleId: string };

const AVAILABILITY_PER_RUN = 600;
const EMBED_JOB_SIZE = 25;
const EMBED_PER_RUN = 2_000;
const MIN_POSTER_BYTES = 40_000;

const RATE_LIMIT_PAUSE_MINUTES: Partial<Record<EnrichmentSource, number>> = {
  simkl: 60,
  anilist: 60,
  watchmode: 24 * 60,
};

const ENRICHERS = [
  { source: "omdb", job: "enrich-ratings", maxAgeDays: 30, perRun: 900, budgetGated: true },
  { source: "simkl", job: "enrich-simkl", maxAgeDays: 90, perRun: 120, budgetGated: true },
  { source: "poster", job: "cache-poster", maxAgeDays: 365, perRun: 2_000, budgetGated: false },
  { source: "anilist", job: "enrich-anilist", maxAgeDays: 14, perRun: 400, budgetGated: true },
] as const satisfies readonly {
  source: EnrichmentSource;
  job: IngestionJob["type"];
  maxAgeDays: number;
  perRun: number;
  budgetGated: boolean;
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

type SourceAttempt<T> = { limited: true } | { limited: false; value: T };

async function withRateLimitPause<T>(
  env: Bindings,
  source: EnrichmentSource,
  run: () => Promise<T>,
): Promise<SourceAttempt<T>> {
  try {
    return { limited: false, value: await run() };
  } catch (error) {
    if (!isRateLimited(error)) {
      throw error;
    }

    await pauseSource(env, source, RATE_LIMIT_PAUSE_MINUTES[source] ?? 30);

    return { limited: true };
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

async function syncCatalog(env: Bindings) {
  const titleIds = await syncCatalogHead(env);

  await advanceDiscoverFrontier(env);
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

export async function queueStaleAvailability(env: Bindings, alreadyQueued: string[] = []) {
  const room = await readBudgetRoom(env, "justwatch");

  if (room <= 0) {
    console.log(JSON.stringify({ event: "availability_backfill_skipped", source: "justwatch" }));

    return 0;
  }

  const skip = new Set(alreadyQueued);
  const [stale, titleIds] = await Promise.all([
    countStaleWorkingSet(env.DB),
    selectStaleWorkingSet(env.DB, Math.min(AVAILABILITY_PER_RUN, room) + skip.size),
  ]);
  const queued = titleIds
    .filter((titleId) => !skip.has(titleId))
    .filter(isKnownTitle)
    .slice(0, Math.min(AVAILABILITY_PER_RUN, room));

  console.log(
    JSON.stringify({ event: "availability_backfill_queued", count: queued.length, stale }),
  );

  await enqueue(
    env.AVAILABILITY_QUEUE,
    queued.map((titleId): IngestionJob => ({ type: "enrich-availability", titleId })),
  );

  return queued.length;
}

function enrichmentRoom(env: Bindings, enricher: (typeof ENRICHERS)[number]) {
  return enricher.budgetGated
    ? readBudgetRoom(env, enricher.source)
    : Promise.resolve(enricher.perRun);
}

export async function queueEnrichment(env: Bindings) {
  for (const enricher of ENRICHERS) {
    if (!sourceConfigured(env, enricher.source)) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const room = await enrichmentRoom(env, enricher);

    if (room <= 0) {
      console.log(JSON.stringify({ event: "enrichment_skipped", source: enricher.source }));

      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await sourceCandidates(
      env,
      enricher.source,
      enricher.maxAgeDays,
      Math.min(enricher.perRun, room),
    );

    console.log(
      JSON.stringify({
        event: "enrichment_queued",
        source: enricher.source,
        count: titleIds.length,
        room,
      }),
    );

    // oxlint-disable-next-line no-await-in-loop
    await enqueue(
      enrichmentQueue(env, enricher.source),
      titleIds.map((titleId): IngestionJob => ({ type: enricher.job, titleId })),
    );
  }
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
    console.log(JSON.stringify({ event: "budget_exhausted", source: "tmdb", partition: id }));

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
  const fresh = await env.DB.prepare(
    `SELECT id AS titleId
     FROM catalog_titles
     WHERE id IN (SELECT value FROM json_each(?))
       AND enriched_at IS NOT NULL
       AND enriched_at > datetime('now', ?)`,
  )
    .bind(JSON.stringify(unique), `-${DEMAND_MAX_AGE_DAYS} days`)
    .all<SavedTitleRow>();
  const skip = new Set(fresh.results.map((row) => row.titleId));

  await enqueue(
    env.AVAILABILITY_QUEUE,
    unique
      .filter((titleId) => !skip.has(titleId))
      .map((titleId): IngestionJob => ({ type: "enrich-availability", titleId })),
  );
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

  const attempt = await withRateLimitPause(env, "watchmode", () =>
    getWatchmodeAvailability(env, mediaType, tmdbId),
  );

  return attempt.limited ? [] : (attempt.value ?? []);
}

async function enrichTitleAvailability(env: Bindings, titleId: string) {
  const parts = titleParts(titleId);

  if (!parts) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    console.log(JSON.stringify({ event: "availability_title_unreadable", titleId }));
    await markAvailabilityChecked(env.DB, titleId);

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

function imdbIdOf(title: { imdbUrl?: string | null } | undefined) {
  return title?.imdbUrl ? (/\/(tt\d+)/u.exec(title.imdbUrl)?.[1] ?? null) : null;
}

async function enrichRatings(env: Bindings, titleId: string) {
  if (!env.OMDB_API_KEY) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);
  const imdbId = imdbIdOf(title);

  if (!imdbId) {
    await storeEnrichmentMiss(env, titleId, "omdb", title ? "no-imdb-id" : "no-title-row");

    return;
  }

  if (!(await claimBudget(env, "omdb"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "omdb", titleId }));

    return;
  }

  const attempt = await withRateLimitPause(env, "omdb", () => getOmdbRatings(env, imdbId));

  if (attempt.limited) {
    return;
  }

  if (!attempt.value) {
    await storeEnrichmentMiss(env, titleId, "omdb", "no-omdb-record");

    return;
  }

  await storeEnrichment(env, titleId, "omdb", {
    ratings: { ...attempt.value, anilistScore: title.ratings?.anilistScore ?? null },
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

async function importDiaryRow(
  env: Bindings,
  job: {
    viewerId: string;
    name: string;
    year: number | null;
    rating: number | null;
    watchedAt: string;
  },
) {
  const titleId = await findByTitle(env, job.name, job.year);

  if (!titleId) {
    console.log(JSON.stringify({ event: "diary_import_unmatched", name: job.name }));

    return;
  }

  const [title] = await getItems(env, [titleId]);

  if (!title) {
    return;
  }

  await storeItems(env.DB, [title], new Date().toISOString());
  await queueAvailability(env, [titleId]);
  await queueTitleEmbeddings(env, [titleId]);
  await env.DB.prepare(
    `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts, updated_at)
     VALUES (?1, ?2, ?3, 'watched', ?4, '', ?5)
     ON CONFLICT(viewer_id, title_id) DO UPDATE SET
       status = 'watched',
       rating = COALESCE(excluded.rating, viewing_entries.rating),
       updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      job.viewerId,
      titleId,
      job.rating,
      job.watchedAt ? `${job.watchedAt} 12:00:00` : new Date().toISOString(),
    )
    .run();
}

function originPosterUrl(url: string | null | undefined) {
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
  const title = (await readRawItems(env.DB, [titleId])).get(titleId);
  const imdbId = env.OMDB_API_KEY ? imdbIdOf(title) : null;

  if (imdbId && (await claimBudget(env, "poster"))) {
    const poster = await getOmdbPoster(env, imdbId);

    if (poster && poster.body.byteLength >= MIN_POSTER_BYTES) {
      await storePoster(env, titleId, poster.body, poster.contentType);

      return;
    }
  }

  const tmdbPoster = originPosterUrl(title?.posterUrl);

  if (!tmdbPoster) {
    await storeEnrichmentMiss(env, titleId, "poster", "no-poster-source");

    return;
  }

  const fallback = await fetchImage(tmdbPoster);

  if (!fallback) {
    await storeEnrichmentMiss(env, titleId, "poster", "poster-fetch-failed");

    return;
  }

  await storePoster(env, titleId, fallback.body, fallback.contentType);
}

async function enrichAnilist(env: Bindings, titleId: string) {
  const [title] = await readItems(env.DB, [titleId]);
  const anilistId = title?.externalIds?.anilistId ?? null;

  if (!anilistId) {
    await storeEnrichmentMiss(env, titleId, "anilist", "no-anilist-id");

    return;
  }

  if (!(await claimBudget(env, "anilist"))) {
    console.log(JSON.stringify({ event: "budget_exhausted", source: "anilist", titleId }));

    return;
  }

  const attempt = await withRateLimitPause(env, "anilist", () => getAnilistDetails(anilistId));

  if (attempt.limited) {
    return;
  }

  const details = attempt.value;

  if (!details) {
    await storeEnrichmentMiss(env, titleId, "anilist", "no-anilist-record");

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

  const attempt = await withRateLimitPause(env, "simkl", () =>
    getSimklIds(env, parts.mediaType, parts.tmdbId),
  );

  if (attempt.limited) {
    return;
  }

  if (!attempt.value) {
    await storeEnrichmentMiss(env, titleId, "simkl", "no-simkl-match");

    return;
  }

  await storeEnrichment(env, titleId, "simkl", { externalIds: attempt.value });
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
    await syncDiscoverPage(env, job.mediaType, job.page, job.partitionId ?? null);

    return;
  }

  if (job.type === "measure-discover-partition") {
    await measureDiscoverPartition(env, job.partitionId);

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

  if (job.type === "import-diary-row") {
    await importDiaryRow(env, job);

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

  if (job.type === "sync-cinemas") {
    await syncCinemaDirectory(env, job.source);

    return;
  }

  if (job.type === "sync-cinema-screenings") {
    await syncCinemaScreenings(env, job.source, job.siteId);

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

  if (job.type === "push-trakt-shelf") {
    await exportTraktShelf(env, job.viewerId, job.origin);

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

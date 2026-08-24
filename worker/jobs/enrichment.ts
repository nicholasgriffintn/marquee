import type { MediaTitle } from "../../src/domain/catalog.ts";
import { getAnilistDetails } from "../clients/anilist.ts";
import { getOmdbRatings, searchOmdb } from "../clients/omdb.ts";
import { logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import { comparableTitle, imdbIdFrom } from "../lib/text.ts";
import { claimBudget, readBudgetRoom } from "../repositories/budgets.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import {
  selectAnilistCandidates,
  selectUnenriched,
  storeEnrichment,
  storeEnrichmentMiss,
  storeImdbId,
} from "../repositories/enrichment.ts";
import type { Bindings, EnrichmentSource, IngestionJob } from "../types.ts";
import { withRateLimitPause } from "./sources.ts";

const ANILIST_KEYWORD_LIMIT = 60;

const ENRICHERS = [
  { source: "omdb", job: "enrich-ratings", maxAgeDays: 30, perRun: 3_000, budgetGated: true },
  { source: "poster", job: "cache-poster", maxAgeDays: 365, perRun: 2_000, budgetGated: false },
  { source: "anilist", job: "enrich-anilist", maxAgeDays: 14, perRun: 120, budgetGated: true },
] as const satisfies readonly {
  source: EnrichmentSource;
  job: IngestionJob["type"];
  maxAgeDays: number;
  perRun: number;
  budgetGated: boolean;
}[];

type Enricher = (typeof ENRICHERS)[number];

function enrichmentQueue(env: Bindings, source: EnrichmentSource) {
  if (source === "omdb") {
    return env.RATINGS_QUEUE;
  }

  if (source === "poster") {
    return env.POSTER_QUEUE;
  }

  return env.ANIME_QUEUE;
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

  return source === "anilist";
}

function enrichmentRoom(env: Bindings, enricher: Enricher) {
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
      logEvent("enrichment_skipped", { source: enricher.source });

      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await sourceCandidates(
      env,
      enricher.source,
      enricher.maxAgeDays,
      Math.min(enricher.perRun, room),
    );

    logEvent("enrichment_queued", { source: enricher.source, count: titleIds.length, room });

    // oxlint-disable-next-line no-await-in-loop
    await enqueue(
      enrichmentQueue(env, enricher.source),
      titleIds.map((titleId): IngestionJob => ({ type: enricher.job, titleId })),
    );
  }
}

async function recoverImdbId(env: Bindings, title: MediaTitle) {
  if (!title.year || !(await claimBudget(env, "omdb"))) {
    return null;
  }

  const attempt = await withRateLimitPause(env, "omdb", () => searchOmdb(env, title.title));

  if (attempt.limited) {
    return null;
  }

  const wanted = comparableTitle(title.title);
  const expected = title.mediaType === "tv" ? "series" : "movie";
  const match = attempt.value.find(
    (result) =>
      result.omdbType === expected &&
      result.year === title.year &&
      comparableTitle(result.title) === wanted,
  );

  if (!match) {
    return null;
  }

  await storeImdbId(env.DB, title.id, match.imdbId);

  logEvent("imdb_id_recovered", { titleId: title.id, imdbId: match.imdbId });

  return match.imdbId;
}

export async function enrichRatings(env: Bindings, titleId: string) {
  if (!env.OMDB_API_KEY) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    await storeEnrichmentMiss(env, titleId, "omdb", "no-title-row");

    return;
  }

  const imdbId = imdbIdFrom(title.imdbUrl) ?? (await recoverImdbId(env, title));

  if (!imdbId) {
    await storeEnrichmentMiss(env, titleId, "omdb", "no-imdb-id");

    return;
  }

  if (!(await claimBudget(env, "omdb"))) {
    logEvent("budget_exhausted", { source: "omdb", titleId });

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

function anilistSchedule(
  env: Bindings,
  anilistId: number,
  title: MediaTitle,
  nextEpisode: { airsAt: string; episode: number },
) {
  return env.DB.prepare(
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
      title.id,
      imdbIdFrom(title.imdbUrl),
      title.title,
      nextEpisode.episode,
      nextEpisode.airsAt,
    )
    .run();
}

export async function enrichAnilist(env: Bindings, titleId: string) {
  const [title] = await readItems(env.DB, [titleId]);
  const anilistId = title?.externalIds?.anilistId ?? null;

  if (!anilistId) {
    await storeEnrichmentMiss(env, titleId, "anilist", "no-anilist-id");

    return;
  }

  if (!(await claimBudget(env, "anilist"))) {
    logEvent("budget_exhausted", { source: "anilist", titleId });

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

  const searchable = [
    ...details.anime.synonyms,
    details.anime.romajiTitle,
    details.anime.englishTitle,
    details.anime.nativeTitle,
  ]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.toLowerCase());
  const material = details.anime.source
    ? [`source:${details.anime.source.toLowerCase().replaceAll("_", "-")}`]
    : [];
  const keywords = [
    ...new Set([
      ...(title?.keywords ?? []),
      ...details.tags,
      ...details.studios.map((studio) => studio.toLowerCase()),
      ...searchable,
      ...material,
    ]),
  ].slice(0, ANILIST_KEYWORD_LIMIT);

  await storeEnrichment(env, titleId, "anilist", {
    anime: details.anime,
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
    await anilistSchedule(env, anilistId, title, details.nextEpisode);
  }
}

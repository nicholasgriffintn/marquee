import type { UserRole } from "../auth/model.ts";
import { queueEmbeddings, queueEnrichment, queueStaleAvailability } from "../jobs/ingestion.ts";
import { readBudgets, resumeSource } from "../repositories/budgets.ts";
import { readCinemaCoverage } from "../repositories/cinemas.ts";
import { readBackfillProgress } from "../repositories/discover.ts";
import { rebuildPeopleIndex } from "../repositories/usher.ts";
import { readWorkingSetStats, rebuildWorkingSet } from "../repositories/working-set.ts";
import type { Bindings, EnrichmentSource, IngestionJob } from "../types.ts";
import { dispatchAlerts, previewAlerts } from "./alerts/dispatch.ts";
import { computeAngleScores } from "./angle-scores.ts";
import { queueCinemaDirectories, queueCinemaScreenings } from "./cinema-sync.ts";
import { advanceDiscoverFrontier } from "./discover.ts";
import { queueRevivalMirrors } from "./revival-mirror.ts";
import { queueRevivalSources } from "./revival.ts";

export const ADMIN_ACTIONS = [
  "sweep-light",
  "sweep-deep",
  "digest",
  "catalog-head",
  "availability",
  "enrichment",
  "enrichment-omdb",
  "enrichment-poster",
  "enrichment-mal",
  "enrichment-anilist",
  "embeddings",
  "discover",
  "schedule",
  "buzz",
  "providers",
  "sections",
  "working-set",
  "cinemas",
  "showtimes",
  "alerts-preview",
  "alerts-send",
  "angle-scores",
  "people",
  "revival-sweep",
  "revival-match",
  "revival-describe",
  "revival-rights",
  "revival-recheck",
  "revival-mirror",
  "anime-ids",
  "revival-group",
] as const;

const RUN_WINDOW_HOURS = 24;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === "string" && ADMIN_ACTIONS.includes(value as AdminAction);
}

const QUEUED_JOBS: Partial<Record<AdminAction, IngestionJob>> = {
  "catalog-head": { type: "sync-catalog" },
  schedule: { type: "sync-schedule" },
  buzz: { type: "sync-buzz" },
  providers: { type: "sync-providers" },
  sections: { type: "build-sections" },
  "revival-match": { type: "match-revival-works", chain: true },
  "revival-describe": { type: "describe-revival-works", chain: true },
  "revival-rights": { type: "check-revival-rights" },
  "revival-recheck": { type: "recheck-revival-works", chain: true },
};

type CountRow = Record<string, number>;

async function catalogueStats(env: Bindings) {
  const [row, working] = await Promise.all([
    env.DB.prepare(
      `SELECT
         tt.titles, tt.movies, tt.shows, tt.posters, tt.animeIds, tt.animeDetails,
         (SELECT count(*) FROM title_embeddings WHERE content_hash IS NOT NULL) AS embeddings,
         (SELECT count(*) FROM title_buzz WHERE article <> '') AS buzz,
         (SELECT count(*) FROM title_schedule WHERE airs_at >= datetime('now')) AS upcoming,
         (SELECT count(*) FROM catalog_sections) AS sections,
         cc.cinemas, cc.cinemasPlaced,
         (SELECT count(*) FROM cinema_films) AS cinemaFilms,
         (SELECT count(*) FROM cinema_screenings WHERE business_day >= date('now')) AS screenings,
         (SELECT count(*) FROM cinema_interest WHERE last_seen_at > datetime('now', '-30 days')) AS interestCells,
         (SELECT count(*) FROM viewing_entries) AS shelfEntries,
         uu.users, uu.alertReady,
         va.alertsSent, va.alertsWeek,
         (SELECT count(*) FROM viewer_signals) AS signals,
         (SELECT count(*) FROM viewer_beliefs WHERE revoked_at IS NULL) AS beliefs,
         (SELECT count(*) FROM catalog_people) AS people,
         (SELECT count(*) FROM catalog_seasons) AS seasons,
         (SELECT count(*) FROM title_insights) AS insights,
         rv.revivalWorks, rv.revivalApproved, rv.revivalMirrored, rv.revivalPending,
         (SELECT count(*) FROM ai_rails) AS railSets,
         (SELECT count(*) FROM pinned_shelves) AS pinnedShelves
       FROM
         (SELECT
            count(*) AS titles,
            sum(CASE WHEN media_type = 'movie' THEN 1 ELSE 0 END) AS movies,
            sum(CASE WHEN media_type = 'tv' THEN 1 ELSE 0 END) AS shows,
            sum(CASE WHEN poster_key IS NOT NULL THEN 1 ELSE 0 END) AS posters,
            sum(CASE WHEN mal_id IS NOT NULL THEN 1 ELSE 0 END) AS animeIds,
            (SELECT count(*) FROM catalog_title_anime) AS animeDetails
          FROM catalog_titles) AS tt,
         (SELECT
            count(*) AS cinemas,
            sum(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) AS cinemasPlaced
          FROM cinemas) AS cc,
         (SELECT
            count(*) AS users,
            sum(CASE WHEN alert_email_verified_at IS NOT NULL THEN 1 ELSE 0 END) AS alertReady
          FROM users) AS uu,
         (SELECT
            count(*) AS alertsSent,
            sum(CASE WHEN julianday(sent_at) > julianday('now', '-7 days') THEN 1 ELSE 0 END) AS alertsWeek
          FROM viewer_alerts) AS va,
         (SELECT
            count(*) AS revivalWorks,
            sum(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS revivalApproved,
            sum(CASE WHEN mirror_state = 'mirrored' THEN 1 ELSE 0 END) AS revivalMirrored,
            sum(CASE WHEN status = 'candidate' THEN 1 ELSE 0 END) AS revivalPending
          FROM revival_works) AS rv`,
    ).first<CountRow>(),
    readWorkingSetStats(env.DB),
  ]);

  return {
    ...row,
    workingSet: working.titles,
    availabilityFresh: working.fresh,
  };
}

const ENRICHMENT_ACTION_SOURCE: Partial<Record<AdminAction, EnrichmentSource>> = {
  "enrichment-omdb": "omdb",
  "enrichment-poster": "poster",
  "enrichment-mal": "mal",
  "enrichment-anilist": "anilist",
};

function enrichmentDetail(queued: Partial<Record<EnrichmentSource, number>>) {
  const entries = Object.entries(queued);

  if (entries.length === 0) {
    return "Nothing queued - no source is configured";
  }

  return entries
    .map(([source, count]) =>
      count === 0 ? `${source}: nothing due` : `${source}: ${count} queued`,
    )
    .join(" · ");
}

const JOB_TYPE_SOURCE: Record<string, string> = {
  "enrich-anime": "mal",
  "enrich-anilist": "mal",
  "enrich-anilist-media": "anilist",
  "enrich-ratings": "omdb",
  "cache-poster": "poster",
  "enrich-availability": "justwatch",
};

async function enrichmentStats(env: Bindings) {
  const [enriched, justwatch, attempted, recent, recentJustwatch] = await Promise.all([
    env.DB.prepare(
      `SELECT source,
              sum(CASE WHEN miss = 0 THEN 1 ELSE 0 END) AS titles,
              sum(CASE WHEN miss = 1 THEN 1 ELSE 0 END) AS misses,
              sum(CASE WHEN miss = 2 THEN 1 ELSE 0 END) AS pending,
              max(fetched_at) AS newest
       FROM title_enrichment
       GROUP BY source
       ORDER BY source`,
    ).all<{
      source: string;
      titles: number;
      misses: number;
      pending: number;
      newest: string;
    }>(),
    env.DB.prepare(
      `SELECT
         sum(CASE WHEN EXISTS (
           SELECT 1 FROM catalog_title_providers WHERE title_id = catalog_titles.id
         ) THEN 1 ELSE 0 END) AS titles,
         sum(CASE WHEN NOT EXISTS (
           SELECT 1 FROM catalog_title_providers WHERE title_id = catalog_titles.id
         ) THEN 1 ELSE 0 END) AS misses,
         max(enriched_at) AS newest
       FROM catalog_titles
       WHERE enriched_at IS NOT NULL`,
    ).first<{ titles: number; misses: number; newest: string }>(),
    env.DB.prepare(
      `SELECT job_type AS jobType, count(*) AS attempted
       FROM ingestion_runs
       WHERE job_type IN ('enrich-anime', 'enrich-anilist', 'enrich-anilist-media', 'enrich-ratings', 'cache-poster', 'enrich-availability')
         AND started_at > datetime('now', ?)
       GROUP BY job_type`,
    )
      .bind(`-${RUN_WINDOW_HOURS} hours`)
      .all<{ jobType: string; attempted: number }>(),
    env.DB.prepare(
      `SELECT source,
              sum(CASE WHEN miss = 0 THEN 1 ELSE 0 END) AS titles,
              sum(CASE WHEN miss = 1 THEN 1 ELSE 0 END) AS misses
       FROM title_enrichment
       WHERE fetched_at > datetime('now', ?)
       GROUP BY source`,
    )
      .bind(`-${RUN_WINDOW_HOURS} hours`)
      .all<{ source: string; titles: number; misses: number }>(),
    env.DB.prepare(
      `SELECT
         sum(CASE WHEN EXISTS (
           SELECT 1 FROM catalog_title_providers WHERE title_id = catalog_titles.id
         ) THEN 1 ELSE 0 END) AS titles,
         sum(CASE WHEN NOT EXISTS (
           SELECT 1 FROM catalog_title_providers WHERE title_id = catalog_titles.id
         ) THEN 1 ELSE 0 END) AS misses
       FROM catalog_titles
       WHERE enriched_at > datetime('now', ?)`,
    )
      .bind(`-${RUN_WINDOW_HOURS} hours`)
      .first<{ titles: number; misses: number }>(),
  ]);

  const attemptedBySource = new Map<string, number>();

  for (const row of attempted.results) {
    const source = JOB_TYPE_SOURCE[row.jobType];

    if (source) {
      attemptedBySource.set(source, (attemptedBySource.get(source) ?? 0) + row.attempted);
    }
  }

  const recentBySource = new Map(recent.results.map((row) => [row.source, row]));

  if (recentJustwatch) {
    recentBySource.set("justwatch", {
      source: "justwatch",
      ...recentJustwatch,
    });
  }

  const withAttempts = (row: {
    source: string;
    titles: number;
    misses: number;
    pending: number;
    newest: string;
  }) => {
    const windowAttempted = attemptedBySource.get(row.source) ?? 0;
    const windowRow = recentBySource.get(row.source);
    const silentFailures = Math.max(
      0,
      windowAttempted - (windowRow?.titles ?? 0) - (windowRow?.misses ?? 0),
    );

    return { ...row, attempted: windowAttempted, silentFailures };
  };

  const justwatchRow = justwatch
    ? [
        withAttempts({
          source: "justwatch",
          titles: justwatch.titles,
          misses: justwatch.misses,
          pending: 0,
          newest: justwatch.newest,
        }),
      ]
    : [];

  return [...enriched.results.map(withAttempts), ...justwatchRow].sort((left, right) =>
    left.source.localeCompare(right.source),
  );
}

export async function readAdminOverview(env: Bindings) {
  const [catalogue, backfill, budgets] = await Promise.all([
    catalogueStats(env),
    readBackfillProgress(env.DB),
    readBudgets(env),
  ]);

  return {
    catalogue,
    backfill,
    budgets,
    fetchedAt: new Date().toISOString(),
  };
}

export async function readAdminPipeline(env: Bindings) {
  const [enrichment, failures, lastRuns] = await Promise.all([
    enrichmentStats(env),
    env.DB.prepare(
      `SELECT job_type AS jobType, subject_id AS subjectId, error, started_at AS startedAt
         FROM ingestion_runs
         WHERE status = 'failed'
         ORDER BY started_at DESC
         LIMIT 15`,
    ).all<{
      jobType: string;
      subjectId: string | null;
      error: string | null;
      startedAt: string;
    }>(),
    env.DB.prepare(
      `SELECT job_type AS jobType, status, max(started_at) AS lastRunAt,
                count(*) AS runs, count(DISTINCT subject_id) AS subjects
         FROM ingestion_runs
         WHERE started_at > datetime('now', ?)
         GROUP BY job_type, status
         ORDER BY lastRunAt DESC
         LIMIT 20`,
    )
      .bind(`-${RUN_WINDOW_HOURS} hours`)
      .all<{
        jobType: string;
        status: string;
        lastRunAt: string;
        runs: number;
        subjects: number;
      }>(),
  ]);

  return {
    enrichment,
    failures: failures.results,
    lastRuns: lastRuns.results,
    runWindowHours: RUN_WINDOW_HOURS,
    fetchedAt: new Date().toISOString(),
  };
}

export async function readAdminListings(env: Bindings) {
  const [cinemas, sections] = await Promise.all([
    readCinemaCoverage(env.DB),
    env.DB.prepare(
      `SELECT id, title, json_array_length(title_ids) AS titles, source_updated_at AS builtAt
         FROM catalog_sections
         ORDER BY rowid`,
    ).all<{ id: string; title: string; titles: number; builtAt: string }>(),
  ]);

  return {
    cinemas,
    sections: sections.results,
    fetchedAt: new Date().toISOString(),
  };
}

export async function runAdminAction(env: Bindings, action: AdminAction) {
  if (action === "alerts-preview" || action === "alerts-send") {
    const origin = env.SITE_ORIGIN ?? "https://marquee.pashi.app";
    const result =
      action === "alerts-send"
        ? await dispatchAlerts(env, origin)
        : await previewAlerts(env, origin);

    return {
      ...result,
      detail:
        action === "alerts-send"
          ? `Sent ${result.emails} email${result.emails === 1 ? "" : "s"}, ${result.feeds} to feeds`
          : `${result.candidates} candidate${result.candidates === 1 ? "" : "s"} waiting, nothing sent`,
    };
  }

  if (action === "people") {
    const people = await rebuildPeopleIndex(env.DB);

    return {
      people,
      detail: `Indexed ${people.toLocaleString()} credited names`,
    };
  }

  if (action === "angle-scores") {
    const scores = await computeAngleScores(env);

    return { angles: scores.length, detail: `Scored ${scores.length} angles` };
  }

  if (action === "sweep-light" || action === "sweep-deep") {
    const instance = await env.CATALOG_SWEEP.create({
      params: { deep: action === "sweep-deep" },
    });

    return { started: instance.id, detail: "Catalogue sweep started" };
  }

  if (action === "digest") {
    const instance = await env.DIGEST_WORKFLOW.create({ params: {} });

    return { started: instance.id, detail: "Digest workflow started" };
  }

  if (action === "availability") {
    const queued = await queueStaleAvailability(env);

    return { queued, detail: `Queued ${queued} availability refreshes` };
  }

  if (action === "enrichment") {
    const queued = await queueEnrichment(env);
    const total = Object.values(queued).reduce((sum, count) => sum + count, 0);

    return { queued: total, detail: enrichmentDetail(queued) };
  }

  const singleSource = ENRICHMENT_ACTION_SOURCE[action];

  if (singleSource) {
    const queued = await queueEnrichment(env, singleSource);
    const count = queued[singleSource];

    if (count === undefined) {
      return { queued: 0, detail: `${singleSource} is not configured` };
    }

    return { queued: count, detail: enrichmentDetail(queued) };
  }

  if (action === "embeddings") {
    await queueEmbeddings(env);

    return { detail: "Queued the next batch of embeddings" };
  }

  if (action === "working-set") {
    const titles = await rebuildWorkingSet(env.DB);

    return {
      queued: titles,
      detail: `Working set now tracks ${titles} titles`,
    };
  }

  if (action === "cinemas") {
    const sources = await queueCinemaDirectories(env);

    return { queued: sources, detail: `Queued ${sources} cinema directories` };
  }

  if (action === "showtimes") {
    const queued = await queueCinemaScreenings(env);

    return {
      queued,
      detail: queued
        ? `Queued ${queued} cinemas for listings`
        : "No viewer has looked for local listings yet",
    };
  }

  if (action === "discover") {
    const frontier = await advanceDiscoverFrontier(env);

    return {
      queued: frontier.pages,
      detail: `Queued ${frontier.pages} discover pages and ${frontier.measuring} window measurements`,
    };
  }

  if (action === "revival-group") {
    await env.REVIVAL_QUEUE.send({ type: "group-revival-prints" });

    return { queued: 1, detail: "Grouping the duplicate prints" };
  }

  if (action === "anime-ids") {
    await env.ANIME_QUEUE.send({ type: "import-anime-ids", offset: 0 });

    return { queued: 1, detail: "Checked the anime id list for a new version" };
  }

  if (action === "revival-sweep") {
    const queued = await queueRevivalSources(env);

    return { queued, detail: `Queued ${queued} public domain sources` };
  }

  if (action === "revival-mirror") {
    const queued = await queueRevivalMirrors(env);

    return {
      queued,
      detail: queued ? `Queued ${queued} prints for mirroring` : "Every approved print is mirrored",
    };
  }

  const job = QUEUED_JOBS[action];

  if (!job) {
    return { detail: "Nothing to do" };
  }

  await env.INGESTION_QUEUE.send(job, { contentType: "json" });

  return { detail: `Queued ${job.type}` };
}

export async function clearSourcePause(env: Bindings, source: EnrichmentSource) {
  await resumeSource(env, source);

  return { detail: `${source} resumed` };
}

export async function listAdminUsers(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.name, u.github_login AS login, u.avatar_url AS avatarUrl, u.role,
            u.created_at AS createdAt,
            (SELECT count(*) FROM viewing_entries WHERE viewer_id = u.id) AS shelfEntries
     FROM users AS u
     ORDER BY u.created_at`,
  ).all<{
    id: string;
    name: string;
    login: string;
    avatarUrl: string | null;
    role: string;
    createdAt: string;
    shelfEntries: number;
  }>();

  return rows.results.map((row) => {
    const role: UserRole = row.role === "admin" ? "admin" : "viewer";

    return {
      id: row.id,
      name: row.name,
      login: row.login,
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      shelfEntries: row.shelfEntries,
      role,
    };
  });
}

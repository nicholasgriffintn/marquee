import type { UserRole } from "../auth/model.ts";
import {
  AVAILABILITY_MAX_AGE_DAYS,
  queueEmbeddings,
  queueEnrichment,
  queueStaleAvailability,
} from "../jobs/ingestion.ts";
import { readBudgets, resumeSource } from "../repositories/budgets.ts";
import { readCinemaCoverage } from "../repositories/cinemas.ts";
import { readBackfillProgress } from "../repositories/discover.ts";
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
  "availability",
  "enrichment",
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
  "revival-sweep",
  "revival-match",
  "revival-mirror",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === "string" && ADMIN_ACTIONS.includes(value as AdminAction);
}

const QUEUED_JOBS: Partial<Record<AdminAction, IngestionJob>> = {
  schedule: { type: "sync-schedule" },
  buzz: { type: "sync-buzz" },
  providers: { type: "sync-providers" },
  sections: { type: "build-sections" },
  "revival-match": { type: "match-revival-works" },
};

type CountRow = Record<string, number>;

async function catalogueStats(env: Bindings) {
  const [row, working] = await Promise.all([
    env.DB.prepare(
      `SELECT
         (SELECT count(*) FROM catalog_titles) AS titles,
         (SELECT count(*) FROM catalog_titles WHERE media_type = 'movie') AS movies,
         (SELECT count(*) FROM catalog_titles WHERE media_type = 'tv') AS shows,
         (SELECT count(*) FROM catalog_titles WHERE poster_key IS NOT NULL) AS posters,
         (SELECT count(*) FROM title_embeddings WHERE content_hash IS NOT NULL) AS embeddings,
         (SELECT count(*) FROM title_buzz WHERE article <> '') AS buzz,
         (SELECT count(*) FROM title_schedule WHERE airs_at >= datetime('now')) AS upcoming,
         (SELECT count(*) FROM catalog_sections) AS sections,
         (SELECT count(*) FROM cinemas) AS cinemas,
         (SELECT count(*) FROM cinemas WHERE latitude IS NOT NULL) AS cinemasPlaced,
         (SELECT count(*) FROM cinema_films) AS cinemaFilms,
         (SELECT count(*) FROM cinema_screenings WHERE business_day >= date('now')) AS screenings,
         (SELECT count(*) FROM cinema_interest WHERE last_seen_at > datetime('now', '-30 days')) AS interestCells,
         (SELECT count(*) FROM viewing_entries) AS shelfEntries,
         (SELECT count(*) FROM users) AS users,
         (SELECT count(*) FROM users WHERE alert_email_verified_at IS NOT NULL) AS alertReady,
         (SELECT count(*) FROM viewer_alerts) AS alertsSent,
         (SELECT count(*) FROM viewer_alerts WHERE julianday(sent_at) > julianday('now', '-7 days')) AS alertsWeek,
         (SELECT count(*) FROM viewer_signals) AS signals,
         (SELECT count(*) FROM viewer_beliefs WHERE revoked_at IS NULL) AS beliefs`,
    ).first<CountRow>(),
    readWorkingSetStats(env.DB, AVAILABILITY_MAX_AGE_DAYS),
  ]);

  return { ...row, workingSet: working.titles, availabilityFresh: working.fresh };
}

async function enrichmentStats(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT source,
            sum(CASE WHEN miss = 0 THEN 1 ELSE 0 END) AS titles,
            sum(CASE WHEN miss = 1 THEN 1 ELSE 0 END) AS misses,
            max(fetched_at) AS newest
     FROM title_enrichment
     GROUP BY source
     ORDER BY source`,
  ).all<{ source: string; titles: number; misses: number; newest: string }>();

  return rows.results;
}

export async function readAdminOverview(env: Bindings) {
  const [catalogue, enrichment, backfill, failures, lastRuns, budgets, cinemas, sections] =
    await Promise.all([
      catalogueStats(env),
      enrichmentStats(env),
      readBackfillProgress(env.DB),
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
        `SELECT job_type AS jobType, status, max(started_at) AS lastRunAt, count(*) AS runs
         FROM ingestion_runs
         GROUP BY job_type, status
         ORDER BY lastRunAt DESC
         LIMIT 20`,
      ).all<{ jobType: string; status: string; lastRunAt: string; runs: number }>(),
      readBudgets(env),
      readCinemaCoverage(env.DB),
      env.DB.prepare(
        `SELECT id, title, json_array_length(title_ids) AS titles, source_updated_at AS builtAt
         FROM catalog_sections
         ORDER BY rowid`,
      ).all<{ id: string; title: string; titles: number; builtAt: string }>(),
    ]);

  return {
    catalogue,
    enrichment,
    backfill,
    failures: failures.results,
    lastRuns: lastRuns.results,
    budgets,
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
          ? `Sent ${result.emails} email${result.emails === 1 ? "" : "s"}`
          : `${result.candidates} candidate${result.candidates === 1 ? "" : "s"} waiting, nothing sent`,
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
    await queueEnrichment(env);

    return { detail: "Queued ratings, posters, Simkl and AniList enrichment" };
  }

  if (action === "embeddings") {
    await queueEmbeddings(env);

    return { detail: "Queued the next batch of embeddings" };
  }

  if (action === "working-set") {
    const titles = await rebuildWorkingSet(env.DB);

    return { queued: titles, detail: `Working set now tracks ${titles} titles` };
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

export async function setUserRole(env: Bindings, userId: string, role: UserRole) {
  if (role === "viewer") {
    const admins = await env.DB.prepare(
      `SELECT count(*) AS total FROM users WHERE role = 'admin' AND id <> ?`,
    )
      .bind(userId)
      .first<{ total: number }>();

    if ((admins?.total ?? 0) === 0) {
      return { ok: false as const, error: "There has to be at least one administrator" };
    }
  }

  const result = await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`)
    .bind(role, userId)
    .run();

  return result.meta.changes > 0
    ? { ok: true as const }
    : { ok: false as const, error: "No such user" };
}

import type { MediaType } from "../../src/domain/catalog.ts";
import { getJustwatchAvailability } from "../clients/justwatch.ts";
import { getWatchmodeAvailability } from "../clients/watchmode.ts";
import { logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { enrichAvailability, markAvailabilityChecked } from "../repositories/availability.ts";
import { claimBudget, readBudgetRoom } from "../repositories/budgets.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import {
  countStaleWorkingSet,
  DEMAND_MAX_AGE_DAYS,
  selectStaleWorkingSet,
} from "../repositories/working-set.ts";
import type { Bindings, IngestionJob } from "../types.ts";
import { titleParts, withRateLimitPause } from "./sources.ts";

const AVAILABILITY_PER_RUN = 600;

export async function queueStaleAvailability(env: Bindings, alreadyQueued: string[] = []) {
  const room = await readBudgetRoom(env, "justwatch");

  if (room <= 0) {
    logEvent("availability_backfill_skipped", { source: "justwatch" });

    return 0;
  }

  const skip = new Set(alreadyQueued);
  const wanted = Math.min(AVAILABILITY_PER_RUN, room);
  const [stale, titleIds] = await Promise.all([
    countStaleWorkingSet(env.DB),
    selectStaleWorkingSet(env.DB, wanted + skip.size),
  ]);
  const queued = titleIds
    .filter((titleId) => !skip.has(titleId))
    .filter(isKnownTitle)
    .slice(0, wanted);

  logEvent("availability_backfill_queued", { count: queued.length, stale });

  await enqueue(
    env.AVAILABILITY_QUEUE,
    queued.map((titleId): IngestionJob => ({ type: "enrich-availability", titleId })),
  );

  return queued.length;
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
    .all<{ titleId: string }>();
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
    logEvent("budget_exhausted", { source: "watchmode", titleId });

    return [];
  }

  const attempt = await withRateLimitPause(env, "watchmode", () =>
    getWatchmodeAvailability(env, mediaType, tmdbId),
  );

  return attempt.limited ? [] : (attempt.value ?? []);
}

export async function enrichTitleAvailability(env: Bindings, titleId: string) {
  const parts = titleParts(titleId);

  if (!parts) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    logEvent("availability_title_unreadable", { titleId });
    await markAvailabilityChecked(env.DB, titleId);

    return;
  }

  if (!(await claimBudget(env, "justwatch"))) {
    logEvent("budget_exhausted", { source: "justwatch", titleId });

    return;
  }

  const availability = await getJustwatchAvailability(parts.mediaType, parts.tmdbId, title.title);

  await enrichAvailability(
    env.DB,
    titleId,
    availability ?? (await watchmodeAvailability(env, titleId, parts.mediaType, parts.tmdbId)),
  );
}

import { UPSTREAM_SOURCES } from "../../src/domain/sources.ts";
import { logEvent } from "../lib/logging.ts";
import {
  budgetSource,
  claimBudget,
  isRateLimited,
  isRefused,
  pauseSource,
  resetBackoff,
  type BudgetableSource,
} from "../repositories/budgets.ts";
import type { Bindings } from "../types.ts";

function backoffFor(source: BudgetableSource) {
  const configured = UPSTREAM_SOURCES[budgetSource(source)];

  return { rateLimited: configured.rateLimited, refused: configured.refused };
}

export type SourceAttempt<T> = { limited: true } | { limited: false; value: T };

export async function withRateLimitPause<T>(
  env: Bindings,
  source: BudgetableSource,
  run: () => Promise<T>,
): Promise<SourceAttempt<T>> {
  const policy = backoffFor(source);

  try {
    const value = await run();

    await resetBackoff(env, source);

    return { limited: false, value };
  } catch (error) {
    if (isRefused(error)) {
      await pauseSource(env, source, policy.refused);
      logEvent("source_refused", {
        source,
        detail: String(error).slice(0, 200),
      });

      return { limited: true };
    }

    if (!isRateLimited(error)) {
      throw error;
    }

    await pauseSource(env, source, policy.rateLimited);

    return { limited: true };
  }
}

export async function withSourceBudget<T>(
  env: Bindings,
  source: BudgetableSource,
  run: () => Promise<T>,
  reserve = 0,
): Promise<T | null> {
  if (!(await claimBudget(env, source, reserve))) {
    return null;
  }

  const attempt = await withRateLimitPause(env, source, run);

  return attempt.limited ? null : attempt.value;
}

export function titleParts(titleId: string) {
  const match = /^(movie|tv):(\d+)$/u.exec(titleId);

  return match
    ? {
        mediaType: match[1] === "movie" ? ("movie" as const) : ("tv" as const),
        tmdbId: Number(match[2]),
      }
    : null;
}

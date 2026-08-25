import type { BackoffPolicy } from "../lib/backoff.ts";
import { logEvent } from "../lib/logging.ts";
import { isRateLimited, isRefused, pauseSource, resetBackoff } from "../repositories/budgets.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

// Every source's pause behaviour lives here, in one place, so a bad backoff
// is a one-line fix instead of a hunt through each job file.
//
// rateLimited: the source told us to slow down (429). Doubles on repeat
// hits so a struggling free API isn't hammered every cycle; a single
// successful call resets it back to the base.
// refused: the source blocked us outright (401/403). Long and flat -
// a block rarely clears itself within a day, so escalating further buys
// nothing.
//
// omdb and poster share the OMDb budget: claimBudget is the real guard
// against the daily limit, so a 429 there means throttle, not exhaustion -
// their base pause is shorter than the rest.
const BACKOFF: Record<EnrichmentSource, { rateLimited: BackoffPolicy; refused: BackoffPolicy }> = {
  jikan: {
    rateLimited: { baseMinutes: 60, capMinutes: 60 * 12 },
    refused: { baseMinutes: 60 * 24 * 7, capMinutes: 60 * 24 * 7 },
  },
  justwatch: {
    rateLimited: { baseMinutes: 30, capMinutes: 60 * 6 },
    refused: { baseMinutes: 60 * 24 * 7, capMinutes: 60 * 24 * 7 },
  },
  omdb: {
    rateLimited: { baseMinutes: 10, capMinutes: 60 * 6 },
    refused: { baseMinutes: 60 * 24 * 7, capMinutes: 60 * 24 * 7 },
  },
  tmdb: {
    rateLimited: { baseMinutes: 30, capMinutes: 60 * 6 },
    refused: { baseMinutes: 60 * 24 * 7, capMinutes: 60 * 24 * 7 },
  },
  poster: {
    rateLimited: { baseMinutes: 10, capMinutes: 60 * 6 },
    refused: { baseMinutes: 60 * 24 * 7, capMinutes: 60 * 24 * 7 },
  },
};

const DEFAULT_BACKOFF = {
  rateLimited: { baseMinutes: 30, capMinutes: 60 * 6 },
  refused: { baseMinutes: 60 * 24 * 7, capMinutes: 60 * 24 * 7 },
};

export type SourceAttempt<T> = { limited: true } | { limited: false; value: T };

export async function withRateLimitPause<T>(
  env: Bindings,
  source: EnrichmentSource,
  run: () => Promise<T>,
): Promise<SourceAttempt<T>> {
  const policy = BACKOFF[source] ?? DEFAULT_BACKOFF;

  try {
    const value = await run();

    await resetBackoff(env, source);

    return { limited: false, value };
  } catch (error) {
    if (isRefused(error)) {
      await pauseSource(env, source, policy.refused);
      logEvent("source_refused", { source, detail: String(error).slice(0, 200) });

      return { limited: true };
    }

    if (!isRateLimited(error)) {
      throw error;
    }

    await pauseSource(env, source, policy.rateLimited);

    return { limited: true };
  }
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

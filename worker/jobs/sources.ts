import { logEvent } from "../lib/logging.ts";
import { isRateLimited, isRefused, pauseSource } from "../repositories/budgets.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

const RATE_LIMIT_PAUSE_MINUTES: Partial<Record<EnrichmentSource, number>> = {
  jikan: 60,
  omdb: 10,
  poster: 10,
};

const DEFAULT_PAUSE_MINUTES = 30;
const REFUSED_PAUSE_MINUTES = 60 * 24 * 7;

export type SourceAttempt<T> = { limited: true } | { limited: false; value: T };

export async function withRateLimitPause<T>(
  env: Bindings,
  source: EnrichmentSource,
  run: () => Promise<T>,
): Promise<SourceAttempt<T>> {
  try {
    return { limited: false, value: await run() };
  } catch (error) {
    if (isRefused(error)) {
      await pauseSource(env, source, REFUSED_PAUSE_MINUTES);
      logEvent("source_refused", { source, detail: String(error).slice(0, 200) });

      return { limited: true };
    }

    if (!isRateLimited(error)) {
      throw error;
    }

    await pauseSource(env, source, RATE_LIMIT_PAUSE_MINUTES[source] ?? DEFAULT_PAUSE_MINUTES);

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

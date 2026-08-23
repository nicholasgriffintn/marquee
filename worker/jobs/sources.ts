import { isRateLimited, pauseSource } from "../repositories/budgets.ts";
import type { Bindings, EnrichmentSource } from "../types.ts";

const RATE_LIMIT_PAUSE_MINUTES: Partial<Record<EnrichmentSource, number>> = {
  simkl: 60,
  anilist: 60,
  watchmode: 24 * 60,
};

const DEFAULT_PAUSE_MINUTES = 30;

export type SourceAttempt<T> = { limited: true } | { limited: false; value: T };

export async function withRateLimitPause<T>(
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

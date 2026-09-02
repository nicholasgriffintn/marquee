import type { UpstreamSourceId } from "../../src/domain/sources.ts";
import type { WorkerBindings } from "../types.ts";
import { errorMessage, logError } from "./logging.ts";

type Usage = {
  calls: number;
  failures: number;
  durationMs: number;
  lastStatus: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

const ERROR_LIMIT = 200;

let pending = new Map<UpstreamSourceId, Usage>();

function usageFor(source: UpstreamSourceId) {
  const existing = pending.get(source);

  if (existing) {
    return existing;
  }

  const created: Usage = {
    calls: 0,
    failures: 0,
    durationMs: 0,
    lastStatus: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
  };

  pending.set(source, created);

  return created;
}

export function recordUpstreamCall(
  source: UpstreamSourceId,
  outcome: { ok: boolean; status?: number; durationMs: number; error?: unknown },
) {
  const usage = usageFor(source);
  const at = new Date().toISOString();

  usage.calls += 1;
  usage.durationMs += Math.max(0, Math.round(outcome.durationMs));
  usage.lastStatus = outcome.status ?? null;

  if (outcome.ok) {
    usage.lastSuccessAt = at;

    return;
  }

  usage.failures += 1;
  usage.lastErrorAt = at;
  usage.lastError = outcome.error
    ? errorMessage(outcome.error, ERROR_LIMIT)
    : `Answered ${outcome.status ?? "nothing"}`;
}

export async function traceUpstream(
  source: UpstreamSourceId,
  run: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();

  try {
    const response = await run();

    recordUpstreamCall(source, {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    recordUpstreamCall(source, {
      ok: false,
      durationMs: Date.now() - startedAt,
      error,
    });

    throw error;
  }
}

function reportUsage(env: Pick<WorkerBindings, "EVENTS">, source: string, usage: Usage) {
  if (!env.EVENTS) {
    return;
  }

  try {
    env.EVENTS.writeDataPoint({
      indexes: ["upstream_call"],
      blobs: ["upstream_call", source, usage.lastError ?? ""],
      doubles: [usage.calls, usage.failures, usage.durationMs],
    });
  } catch {
    return;
  }
}

type UsageSink = { DB: Database; EVENTS?: AnalyticsEngineDataset };

export async function flushUpstreamUsage(env: UsageSink) {
  if (pending.size === 0) {
    return 0;
  }

  const drained = [...pending.entries()];

  pending = new Map();

  const restore = () => {
    for (const [source, usage] of drained) {
      const current = pending.get(source);

      if (!current) {
        pending.set(source, usage);
        continue;
      }

      current.calls += usage.calls;
      current.failures += usage.failures;
      current.durationMs += usage.durationMs;
      current.lastStatus ??= usage.lastStatus;
      current.lastSuccessAt ??= usage.lastSuccessAt;
      current.lastErrorAt ??= usage.lastErrorAt;
      current.lastError ??= usage.lastError;
    }
  };

  try {
    await env.DB.transaction(async (transaction) => {
      for (const [source, usage] of drained) {
        reportUsage(env, source, usage);

        // oxlint-disable-next-line no-await-in-loop
        await transaction.execute(
          `INSERT INTO source_usage (
             source, day, calls, failures, duration_ms,
             last_status, last_success_at, last_error_at, last_error
           )
           VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (source, day) DO UPDATE SET
             calls = source_usage.calls + excluded.calls,
             failures = source_usage.failures + excluded.failures,
             duration_ms = source_usage.duration_ms + excluded.duration_ms,
             last_status = COALESCE(excluded.last_status, source_usage.last_status),
             last_success_at = GREATEST(source_usage.last_success_at, excluded.last_success_at),
             last_error_at = GREATEST(source_usage.last_error_at, excluded.last_error_at),
             last_error = CASE
               WHEN excluded.last_error_at IS NOT NULL THEN excluded.last_error
               ELSE source_usage.last_error
             END,
             updated_at = CURRENT_TIMESTAMP`,
          [
            source,
            usage.calls,
            usage.failures,
            usage.durationMs,
            usage.lastStatus,
            usage.lastSuccessAt,
            usage.lastErrorAt,
            usage.lastError,
          ],
        );
      }
    });
  } catch (error) {
    restore();
    logError("upstream_usage_flush_failed", error, { sources: drained.length });
  }

  return drained.length;
}

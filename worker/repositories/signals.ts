import { isDecisionId } from "../lib/decisions.ts";
import { logError } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord, parseJson, stringAt } from "../lib/values.ts";

export const SIGNAL_TYPES = ["rejection", "never", "provider_exit", "watched"] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export type Signal = {
  type: SignalType;
  titleId?: string;
  journeyId?: string;
  decisionId?: string;
  context?: Record<string, unknown>;
  weight?: number;
  expiresInDays?: number;
};

export type StoredSignal = {
  type: SignalType;
  titleId: string;
  journeyId: string;
  decisionId: string;
  context: Record<string, unknown>;
  weight: number;
  createdAt: string;
};

type SignalRow = {
  type: string;
  title_id: string | null;
  journey_id: string | null;
  decision_id: string | null;
  context: string;
  weight: number;
  created_at: string;
};

const CONTEXT_LIMIT = 1_000;

export function isSignalType(value: unknown): value is SignalType {
  return typeof value === "string" && SIGNAL_TYPES.includes(value as SignalType);
}

function expiryFor(days: number | undefined) {
  if (!days) {
    return null;
  }

  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function recordSignal(db: D1Database, viewerId: string, signal: Signal) {
  if (!viewerId) {
    return;
  }

  try {
    await db
      .prepare(
        `INSERT INTO viewer_signals
           (id, viewer_id, type, title_id, journey_id, decision_id, context, weight, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        crypto.randomUUID(),
        viewerId,
        signal.type,
        isKnownTitle(signal.titleId) ? signal.titleId : null,
        signal.journeyId?.slice(0, 40) ?? null,
        isDecisionId(signal.decisionId) ? signal.decisionId : null,
        JSON.stringify(signal.context ?? {}).slice(0, CONTEXT_LIMIT),
        signal.weight ?? 1,
        expiryFor(signal.expiresInDays),
      )
      .run();
  } catch (error) {
    logError("signal_write_failed", error, { type: signal.type });
  }
}

export async function readSignals(
  db: D1Database,
  viewerId: string,
  types: SignalType[],
  limit = 200,
): Promise<StoredSignal[]> {
  if (!viewerId || types.length === 0) {
    return [];
  }

  try {
    const rows = await db
      .prepare(
        `SELECT type, title_id, journey_id, decision_id, context, weight, created_at
           FROM viewer_signals
          WHERE viewer_id = ?1
            AND type IN (${types.map(() => "?").join(",")})
            AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))
          ORDER BY created_at DESC
          LIMIT ${clamp(limit, 1, 500)}`,
      )
      .bind(viewerId, ...types)
      .all<SignalRow>();

    return rows.results.flatMap((row): StoredSignal[] => {
      if (!isSignalType(row.type)) {
        return [];
      }

      let context: Record<string, unknown> = {};

      try {
        const parsed: unknown = JSON.parse(row.context);

        context = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      } catch {
        context = {};
      }

      return [
        {
          type: row.type,
          titleId: row.title_id ?? "",
          journeyId: row.journey_id ?? "",
          decisionId: row.decision_id ?? "",
          context,
          weight: row.weight,
          createdAt: row.created_at,
        },
      ];
    });
  } catch (error) {
    logError("signal_read_failed", error);

    return [];
  }
}

export async function rejectedTitleIds(db: D1Database, viewerId: string) {
  const signals = await readSignals(db, viewerId, ["rejection", "never"], 300);

  return [...new Set(signals.map((signal) => signal.titleId).filter(Boolean))];
}

export async function recentExitFor(db: D1Database, viewerId: string, titleId: string, days = 45) {
  try {
    const row = await db
      .prepare(
        `SELECT journey_id AS journeyId, decision_id AS decisionId, context
           FROM viewer_signals
          WHERE viewer_id = ?1 AND title_id = ?2 AND type = 'provider_exit'
            AND julianday(created_at) > julianday('now', ?3)
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(viewerId, titleId, `-${days} days`)
      .first<{ journeyId: string | null; decisionId: string | null; context: string }>();

    if (!row) {
      return null;
    }

    const parsed = parseJson(row.context);

    return {
      journeyId: row.journeyId ?? "",
      decisionId: row.decisionId ?? "",
      source: (isRecord(parsed) && stringAt(parsed, "source")) || "",
    };
  } catch (error) {
    logError("exit_lookup_failed", error);

    return null;
  }
}

export async function neverTitleIds(db: D1Database, viewerId: string) {
  const signals = await readSignals(db, viewerId, ["never"], 100);

  return [...new Set(signals.map((signal) => signal.titleId).filter(Boolean))];
}

export async function pruneSignals(db: D1Database) {
  try {
    await db
      .prepare(
        `DELETE FROM viewer_signals
          WHERE expires_at IS NOT NULL AND julianday(expires_at) <= julianday('now')`,
      )
      .run();
  } catch (error) {
    logError("signal_prune_failed", error);
  }
}

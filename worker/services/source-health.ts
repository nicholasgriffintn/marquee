import {
  UPSTREAM_SOURCES,
  UPSTREAM_SOURCE_IDS,
  type UpstreamSourceId,
} from "../../src/domain/sources.ts";
import { logEvent } from "../lib/logging.ts";
import { readBudgets } from "../repositories/budgets.ts";
import { readSourceUsage, type SourceUsageRow } from "../repositories/source-usage.ts";
import type { Bindings } from "../types.ts";
import { BUDGET_SAMPLE_SOURCES } from "./admin-sample.ts";

export type SourceCredentialState = "configured" | "missing" | "open";

export type SourceState = "healthy" | "degraded" | "failing" | "paused" | "unconfigured" | "idle";

export type SourceHealth = {
  source: UpstreamSourceId;
  label: string;
  kind: string;
  powers: string;
  optional: boolean;
  enforced: boolean;
  credential: string | null;
  credentialState: SourceCredentialState;
  windowKind: "day" | "month";
  callLimit: number;
  claimed: number;
  pausedUntil: string | null;
  consecutivePauses: number;
  calls: number;
  failures: number;
  averageLatencyMs: number;
  lastStatus: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  sampled: boolean;
  state: SourceState;
};

const DEGRADED_FAILURE_RATE = 0.25;

function credentialState(env: Bindings, credential: string | null): SourceCredentialState {
  if (!credential) {
    return "open";
  }

  const value = (env as unknown as Record<string, unknown>)[credential];

  return typeof value === "string" && value.trim() ? "configured" : "missing";
}

function stateOf(health: SourceHealth, paused: boolean, failureRate: number): SourceState {
  if (health.credentialState === "missing") {
    return "unconfigured";
  }

  if (paused) {
    return "paused";
  }

  if (health.calls === 0) {
    return "idle";
  }

  if (failureRate >= 1) {
    return "failing";
  }

  return failureRate > DEGRADED_FAILURE_RATE ? "degraded" : "healthy";
}

export async function readSourceHealth(env: Bindings): Promise<SourceHealth[]> {
  const [budgets, usage] = await Promise.all([readBudgets(env), readSourceUsage(env.DB)]);
  const budgetBySource = new Map(budgets.map((budget) => [budget.source, budget]));
  const usageBySource = new Map<string, SourceUsageRow>(usage.map((row) => [row.source, row]));
  const now = Date.now();

  return UPSTREAM_SOURCE_IDS.map((id) => {
    const configured = UPSTREAM_SOURCES[id];
    const budget = budgetBySource.get(id);
    const observed = usageBySource.get(id);
    const calls = observed?.calls ?? 0;
    const failures = observed?.failures ?? 0;
    const pausedUntil = budget?.pausedUntil ?? null;
    const paused = Boolean(pausedUntil && new Date(pausedUntil).getTime() > now);
    const health: SourceHealth = {
      state: "idle",
      source: id,
      label: configured.label,
      kind: configured.kind,
      powers: configured.powers,
      optional: configured.optional,
      enforced: configured.enforced,
      credential: configured.credential,
      credentialState: credentialState(env, configured.credential),
      windowKind: configured.window,
      callLimit: configured.callLimit,
      claimed: budget?.used ?? 0,
      pausedUntil,
      consecutivePauses: budget?.consecutivePauses ?? 0,
      calls,
      failures,
      averageLatencyMs: calls > 0 ? Math.round((observed?.durationMs ?? 0) / calls) : 0,
      lastStatus: observed?.lastStatus ?? null,
      lastSuccessAt: observed?.lastSuccessAt ?? null,
      lastErrorAt: observed?.lastErrorAt ?? null,
      lastError: observed?.lastError ?? null,
      sampled: BUDGET_SAMPLE_SOURCES.has(id),
    };

    health.state = stateOf(health, paused, calls > 0 ? failures / calls : 0);

    return health;
  });
}

const QUIET_STATES = new Set<SourceState>(["healthy", "idle"]);

export async function reportSourceHealth(env: Bindings) {
  const health = await readSourceHealth(env);
  const struggling = health.filter((source) => !QUIET_STATES.has(source.state));

  for (const source of struggling) {
    logEvent("source_unhealthy", {
      source: source.source,
      state: source.state,
      optional: source.optional,
      calls: source.calls,
      failures: source.failures,
      lastSuccessAt: source.lastSuccessAt,
      lastError: source.lastError,
    });
  }

  logEvent("source_health_reported", {
    sources: health.length,
    struggling: struggling.length,
  });

  return struggling.length;
}

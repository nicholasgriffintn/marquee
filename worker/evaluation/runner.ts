import {
  tallyOf,
  type EvaluationReport,
  type PolicyResult,
  type RelevanceResult,
} from "../../src/domain/evaluation.ts";
import { errorMessage, logEvent } from "../lib/logging.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { matchPolicy } from "../security/policies.ts";
import { searchCatalogue, searchCatalogueHybrid } from "../services/catalog.ts";
import type { Bindings } from "../types.ts";
import { GOLDEN_QUERIES, type GoldenQuery } from "./golden-queries.ts";
import { POLICY_FIXTURES } from "./policy-fixtures.ts";

const RESULT_LIMIT = 40;
const WAVE_SIZE = 3;

function failedFixture(fixture: GoldenQuery, error: unknown): RelevanceResult {
  return {
    id: fixture.id,
    query: fixture.query,
    mode: fixture.mode,
    within: fixture.within,
    verdict: "fail",
    ranks: fixture.expect.map((titleId) => ({ titleId, rank: null })),
    intruders: [],
    note: `The fixture threw: ${errorMessage(error)}`,
  };
}

function rankOf(items: { id: string }[], titleId: string) {
  const index = items.findIndex((item) => item.id === titleId);

  return index === -1 ? null : index + 1;
}

async function runGoldenQuery(
  env: Bindings,
  fixture: GoldenQuery,
  known: Set<string>,
): Promise<RelevanceResult> {
  const missing = fixture.expect.filter((titleId) => !known.has(titleId));
  const base = {
    id: fixture.id,
    query: fixture.query,
    mode: fixture.mode,
    within: fixture.within,
    note: fixture.note,
  };

  if (missing.length > 0) {
    return {
      ...base,
      verdict: "skipped" as const,
      ranks: missing.map((titleId) => ({ titleId, rank: null })),
      intruders: [],
      note: `Not in the catalogue yet: ${missing.join(", ")}`,
    };
  }

  const results =
    fixture.mode === "hybrid"
      ? await searchCatalogueHybrid(env, fixture.query, [])
      : await searchCatalogue(env, fixture.query, []);
  const items = results.items.slice(0, RESULT_LIMIT);
  const ranks = fixture.expect.map((titleId) => ({ titleId, rank: rankOf(items, titleId) }));
  const intruders = (fixture.absent ?? []).filter((titleId) => rankOf(items, titleId) !== null);
  const placed = ranks.every((entry) => entry.rank !== null && entry.rank <= fixture.within);
  const answered = fixture.expect.length > 0 || items.length > 0;

  return {
    ...base,
    verdict: placed && intruders.length === 0 && answered ? "pass" : "fail",
    ranks,
    intruders,
  };
}

function runPolicyFixtures(): PolicyResult[] {
  return POLICY_FIXTURES.map((fixture) => {
    const actual = matchPolicy(fixture.path, fixture.method)?.name ?? null;

    return {
      id: fixture.id,
      path: fixture.path,
      method: fixture.method,
      verdict: actual === fixture.expect ? "pass" : "fail",
      expected: fixture.expect ?? "none",
      actual: actual ?? "none",
    };
  });
}

function meanReciprocalRank(relevance: RelevanceResult[]) {
  const ranks = relevance
    .filter((result) => result.verdict !== "skipped")
    .flatMap((result) => result.ranks.map((entry) => entry.rank));

  if (ranks.length === 0) {
    return 0;
  }

  return ranks.reduce<number>((total, rank) => total + (rank ? 1 / rank : 0), 0) / ranks.length;
}

export async function runEvaluation(env: Bindings): Promise<EvaluationReport> {
  const expected = [...new Set(GOLDEN_QUERIES.flatMap((fixture) => fixture.expect))];
  const known = new Set(
    (await readItems(env.DB, expected, expected.length)).map((item) => item.id),
  );
  const relevance: RelevanceResult[] = [];

  for (let index = 0; index < GOLDEN_QUERIES.length; index += WAVE_SIZE) {
    const wave = GOLDEN_QUERIES.slice(index, index + WAVE_SIZE);
    // oxlint-disable-next-line no-await-in-loop -- waves run in parallel, one wave at a time
    const settled = await Promise.allSettled(
      wave.map((fixture) => runGoldenQuery(env, fixture, known)),
    );

    relevance.push(
      ...settled.map((outcome, position) =>
        outcome.status === "fulfilled"
          ? outcome.value
          : failedFixture(wave[position], outcome.reason),
      ),
    );
  }

  const policy = runPolicyFixtures();
  const report: EvaluationReport = {
    relevance,
    policy,
    tally: tallyOf([...relevance, ...policy].map((result) => result.verdict)),
    meanReciprocalRank: meanReciprocalRank(relevance),
    ranAt: new Date().toISOString(),
  };

  logEvent("evaluation_run", {
    ...report.tally,
    mrr: Number(report.meanReciprocalRank.toFixed(3)),
  });

  return report;
}

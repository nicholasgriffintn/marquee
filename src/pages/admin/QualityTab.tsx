import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { EvaluationVerdict, RelevanceResult } from "../../domain/evaluation";
import type { AdminQuality } from "../../hooks/useAdmin";
import { useEvaluation } from "../../hooks/useEvaluation";
import { useResource } from "../../hooks/useResource";
import { Button, Callout, Panel, Stat, StatGrid, TabPanel } from "../../ui";

import styles from "./admin.module.css";

const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

function seconds(value: number) {
  return value > 0 ? `${(value / 1_000).toFixed(1)}s to click` : "no clicks yet";
}

function share(part: number, whole: number) {
  return whole > 0 ? PERCENT.format(part / whole) : "no decisions";
}

function cost(value: number) {
  return value > 0 ? `$${value.toFixed(2)}` : "no priced calls";
}

function verdictLabel(verdict: EvaluationVerdict) {
  return verdict === "pass" ? "pass" : verdict === "fail" ? "FAIL" : "skipped";
}

function relevanceDetail(result: RelevanceResult) {
  if (result.verdict === "skipped") {
    return result.note;
  }

  const misplaced = result.ranks
    .filter((entry) => entry.rank === null || entry.rank > result.within)
    .map((entry) => `${entry.titleId} at ${entry.rank ?? "nowhere"}`);
  const intruders = result.intruders.map((titleId) => `${titleId} should not be here`);

  return [...misplaced, ...intruders].join(", ") || `all within ${result.within}`;
}

export function QualityTab({ revision }: { revision: number }) {
  const { data: quality, error } = useResource<AdminQuality>("/api/admin/quality", {
    errorMessage: "Could not read the angle scores.",
    refreshKey: String(revision),
  });
  const evaluation = useEvaluation();
  const report = evaluation.report;

  return (
    <ErrorBoundary label="Quality">
      <TabPanel id="quality" idPrefix="admin">
        {error && <Callout>{error}</Callout>}

        <Panel heading="What the angles are earning">
          <p className={styles.note}>
            Counted from events that arrived with a journey this worker signed, over the last
            twenty-eight days. Anything a client made up on its own carries no angle and never
            reaches these numbers. Attrition is the share of clicks that ended without a provider or
            a watch.
          </p>
          {quality && quality.angles.length > 0 ? (
            <ul className={styles.list}>
              {quality.angles.map((angle) => (
                <li key={angle.angle}>
                  <strong>{angle.angle}</strong>
                  <small>
                    {angle.impressions.toLocaleString()} shown · {angle.clicks.toLocaleString()}{" "}
                    clicked · {angle.views.toLocaleString()} opened · {angle.exits.toLocaleString()}{" "}
                    left for a service · {angle.watched.toLocaleString()} watched
                  </small>
                  <span className={styles.spacer} />
                  <small>
                    {PERCENT.format(angle.attrition)} attrition · {seconds(angle.dwellMs)}
                  </small>
                  <code>{angle.score.toFixed(3)}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              No scored angles yet. Run “Rescore shelves” once events have accumulated.
            </p>
          )}
        </Panel>

        <Panel heading="What the recommendations decided">
          <p className={styles.note}>
            Every rail, pick, order, digest and curator answer records the candidates it saw and the
            titles it chose. Followed and refused count the decisions a viewer later acted on,
            joined back through the signed journey that carried the decision to the client. Over the
            last twenty-eight days.
          </p>
          {quality && quality.decisions.length > 0 ? (
            <ul className={styles.list}>
              {quality.decisions.map((entry) => (
                <li key={entry.feature}>
                  <strong>{entry.feature}</strong>
                  <small>
                    {entry.decisions.toLocaleString()} decisions · {entry.served.toLocaleString()}{" "}
                    served · {entry.barren.toLocaleString()} empty · {entry.failed.toLocaleString()}{" "}
                    failed · {entry.fellBack.toLocaleString()} fell back to another model
                  </small>
                  <span className={styles.spacer} />
                  <small>
                    {Math.round(entry.candidates)} candidates · {Math.round(entry.latencyMs)}ms ·{" "}
                    {cost(entry.costUsd)} · {share(entry.followed, entry.decisions)} followed ·{" "}
                    {share(entry.refused, entry.decisions)} refused
                  </small>
                  <code>{share(entry.served, entry.decisions)}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              No decisions recorded yet. They accumulate as viewers ask for recommendations.
            </p>
          )}
        </Panel>

        <Panel
          heading="Golden queries and guard policies"
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={evaluation.isRunning}
              onClick={() => void evaluation.run()}
            >
              {evaluation.isRunning ? "Running…" : "Run the fixtures"}
            </Button>
          }
        >
          <p className={styles.note}>
            The fixtures run against live retrieval and the live guard rules, so this is the check
            to run before and after any ranking change. A query whose titles are not in the
            catalogue yet is skipped rather than failed.
          </p>
          {evaluation.error && <Callout>{evaluation.error}</Callout>}
          {report && (
            <>
              <StatGrid min="120px">
                <Stat value={report.tally.passed} label="passed" />
                <Stat
                  value={report.tally.failed}
                  label="failed"
                  {...(report.tally.failed > 0 ? { tone: "warning" as const } : {})}
                />
                <Stat value={report.tally.skipped} label="skipped" />
                <Stat value={report.meanReciprocalRank.toFixed(3)} label="mean reciprocal rank" />
              </StatGrid>
              <ul className={styles.list}>
                {report.relevance.map((result) => (
                  <li key={result.id}>
                    <strong>{result.id}</strong>
                    <small>
                      “{result.query}” · {result.mode}
                    </small>
                    <span className={styles.spacer} />
                    <small>{relevanceDetail(result)}</small>
                    <code className={result.verdict === "fail" ? styles.failed : undefined}>
                      {verdictLabel(result.verdict)}
                    </code>
                  </li>
                ))}
                {report.policy.map((result) => (
                  <li key={result.id}>
                    <strong>{result.id}</strong>
                    <small>
                      {result.method} {result.path}
                    </small>
                    <span className={styles.spacer} />
                    <small>
                      expected {result.expected}, got {result.actual}
                    </small>
                    <code className={result.verdict === "fail" ? styles.failed : undefined}>
                      {verdictLabel(result.verdict)}
                    </code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </TabPanel>
    </ErrorBoundary>
  );
}

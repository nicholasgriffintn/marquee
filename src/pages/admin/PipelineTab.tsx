import { useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminOverview } from "../../hooks/useAdmin";
import { parseDatabaseDate } from "../../lib/dates";
import { RUN_STATUSES, type RunStatus } from "./config";

function stamp(value: string) {
  return parseDatabaseDate(value)?.toLocaleString() ?? "never";
}

export function PipelineTab({ overview }: { overview: AdminOverview | null }) {
  const [runStatus, setRunStatus] = useState<RunStatus>("all");
  const runs = (overview?.lastRuns ?? []).filter(
    (run) => runStatus === "all" || run.status === runStatus,
  );

  return (
    <ErrorBoundary label="The pipeline">
      <div role="tabpanel" id="admin-panel-pipeline" aria-labelledby="admin-tab-pipeline">
        {overview && overview.lastRuns.length > 0 && (
          <section className="panel-block" aria-labelledby="admin-runs-title">
            <h2 id="admin-runs-title">Recent jobs</h2>
            <p className="admin-note">Last {overview.runWindowHours} hours</p>
            <div className="admin-filters">
              {RUN_STATUSES.map((status) => (
                <button
                  type="button"
                  key={status}
                  aria-pressed={runStatus === status}
                  className={`admin-chip${runStatus === status ? " selected" : ""}`}
                  onClick={() => setRunStatus(status)}
                >
                  {status}
                  <em>
                    {status === "all"
                      ? overview.lastRuns.length
                      : overview.lastRuns.filter((run) => run.status === status).length}
                  </em>
                </button>
              ))}
            </div>
            <ul className="admin-list">
              {runs.map((run) => (
                <li key={`${run.jobType}-${run.status}`}>
                  <strong>{run.jobType}</strong>
                  <small className={`run-status run-status-${run.status}`}>
                    {run.status} · {run.runs.toLocaleString()}
                    {run.subjects < run.runs ? ` · ${run.subjects.toLocaleString()} unique` : ""}
                  </small>
                  <span className="spacer" />
                  <time dateTime={run.lastRunAt}>{stamp(run.lastRunAt)}</time>
                </li>
              ))}
            </ul>
          </section>
        )}
        {overview && overview.failures.length > 0 && (
          <section className="panel-block" aria-labelledby="admin-failures-title">
            <h2 id="admin-failures-title">Latest failures</h2>
            <ul className="failure-list">
              {overview.failures.map((failure) => (
                <li key={`${failure.jobType}-${failure.startedAt}-${failure.subjectId ?? ""}`}>
                  <strong>{failure.jobType}</strong>
                  <small>
                    {failure.subjectId ? `${failure.subjectId} · ` : ""}
                    {failure.error ?? "failed"}
                  </small>
                  <time dateTime={failure.startedAt}>{stamp(failure.startedAt)}</time>
                </li>
              ))}
            </ul>
          </section>
        )}
        {overview && overview.enrichment.length > 0 && (
          <section className="panel-block" aria-labelledby="admin-enrichment-title">
            <h2 id="admin-enrichment-title">Enrichment coverage</h2>
            <ul className="admin-list">
              {overview.enrichment.map((source) => {
                const recorded = source.titles + source.misses;
                const hitRate = recorded > 0 ? Math.round((source.titles / recorded) * 100) : null;
                const silentRate =
                  source.attempted > 0
                    ? Math.round((source.silentFailures / source.attempted) * 100)
                    : 0;
                const budget = overview.budgets.find((row) => row.source === source.source);
                const pausedUntil = budget?.pausedUntil
                  ? parseDatabaseDate(budget.pausedUntil)
                  : null;
                const isPaused = pausedUntil
                  ? pausedUntil.getTime() > new Date(overview.fetchedAt).getTime()
                  : false;

                return (
                  <li key={source.source}>
                    <strong>{source.source}</strong>
                    <small>{source.titles.toLocaleString()} titles</small>
                    {hitRate !== null && <small>{hitRate}% hit rate</small>}
                    {source.misses > 0 && <code>{source.misses.toLocaleString()} no data</code>}
                    {source.attempted > 0 && (
                      <small>{source.attempted.toLocaleString()} attempted · 24h</small>
                    )}
                    {source.silentFailures > 0 && (
                      <code className="run-status-failed">
                        {source.silentFailures.toLocaleString()} failed silently ({silentRate}%)
                      </code>
                    )}
                    {source.pending > 0 && (
                      <code>{source.pending.toLocaleString()} retrying soon</code>
                    )}
                    {isPaused && pausedUntil && (
                      <code className="run-status-failed">
                        paused until {pausedUntil.toLocaleString()}
                        {budget && budget.consecutivePauses > 1
                          ? ` · ${budget.consecutivePauses}x in a row`
                          : ""}
                      </code>
                    )}
                    <span className="spacer" />
                    <time dateTime={source.newest}>{stamp(source.newest)}</time>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </ErrorBoundary>
  );
}

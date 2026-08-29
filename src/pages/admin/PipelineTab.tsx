import { useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminOverview, AdminPipeline } from "../../hooks/useAdmin";
import { useResource } from "../../hooks/useResource";
import { classNames } from "../../lib/class-names";
import { parseDatabaseDate } from "../../lib/dates";
import { Callout, Chip, Panel, TabPanel } from "../../ui";
import { RUN_STATUSES, type RunStatus } from "./config";
import { ReadinessPanel } from "./ReadinessPanel";

import styles from "./admin.module.css";

function stamp(value: string) {
  return parseDatabaseDate(value)?.toLocaleString() ?? "never";
}

export function PipelineTab({
  overview,
  revision,
}: {
  overview: AdminOverview | null;
  revision: number;
}) {
  const [runStatus, setRunStatus] = useState<RunStatus>("all");
  const { data: pipeline, error } = useResource<AdminPipeline>("/api/admin/pipeline", {
    errorMessage: "Could not read the pipeline.",
    refreshKey: String(revision),
  });
  const runs = (pipeline?.lastRuns ?? []).filter(
    (run) => runStatus === "all" || run.status === runStatus,
  );

  return (
    <ErrorBoundary label="The pipeline">
      <TabPanel id="pipeline" idPrefix="admin">
        {error && <Callout>{error}</Callout>}
        {pipeline?.readiness && <ReadinessPanel readiness={pipeline.readiness} />}
        {pipeline && pipeline.lastRuns.length > 0 && (
          <Panel heading="Recent jobs">
            <p className={styles.note}>Last {pipeline.runWindowHours} hours</p>
            <div className={styles.filters}>
              {RUN_STATUSES.map((status) => (
                <Chip
                  key={status}
                  pressed={runStatus === status}
                  selected={runStatus === status}
                  onClick={() => setRunStatus(status)}
                >
                  {status}
                  <em>
                    {status === "all"
                      ? pipeline.lastRuns.length
                      : pipeline.lastRuns.filter((run) => run.status === status).length}
                  </em>
                </Chip>
              ))}
            </div>
            <ul className={styles.list}>
              {runs.map((run) => (
                <li key={`${run.jobType}-${run.status}`}>
                  <strong>{run.jobType}</strong>
                  <small className={classNames(run.status === "failed" && styles.failed)}>
                    {run.status} · {run.runs.toLocaleString()}
                    {run.subjects < run.runs ? ` · ${run.subjects.toLocaleString()} unique` : ""}
                  </small>
                  <span className={styles.spacer} />
                  <time dateTime={run.lastRunAt}>{stamp(run.lastRunAt)}</time>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {pipeline && pipeline.failures.length > 0 && (
          <Panel heading="Latest failures">
            <ul className={styles.failures}>
              {pipeline.failures.map((failure) => (
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
          </Panel>
        )}
        {pipeline && pipeline.enrichment.length > 0 && (
          <Panel heading="Enrichment coverage">
            <ul className={styles.list}>
              {pipeline.enrichment.map((source) => {
                const recorded = source.titles + source.misses;
                const hitRate = recorded > 0 ? Math.round((source.titles / recorded) * 100) : null;
                const silentRate =
                  source.attempted > 0
                    ? Math.round((source.silentFailures / source.attempted) * 100)
                    : 0;
                const budget = overview?.budgets.find((row) => row.source === source.source);
                const pausedUntil = budget?.pausedUntil
                  ? parseDatabaseDate(budget.pausedUntil)
                  : null;
                const isPaused = pausedUntil
                  ? pausedUntil.getTime() > new Date(pipeline.fetchedAt).getTime()
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
                      <code className={styles.failed}>
                        {source.silentFailures.toLocaleString()} failed silently ({silentRate}%)
                      </code>
                    )}
                    {source.pending > 0 && (
                      <code>{source.pending.toLocaleString()} retrying soon</code>
                    )}
                    {isPaused && pausedUntil && (
                      <code className={styles.failed}>
                        paused until {pausedUntil.toLocaleString()}
                        {budget && budget.consecutivePauses > 1
                          ? ` · ${budget.consecutivePauses}x in a row`
                          : ""}
                      </code>
                    )}
                    <span className={styles.spacer} />
                    <time dateTime={source.newest}>{stamp(source.newest)}</time>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </TabPanel>
    </ErrorBoundary>
  );
}

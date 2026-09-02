import type { SourceHealth } from "../../hooks/useAdmin";
import { classNames } from "../../lib/class-names";
import { parseDatabaseDate } from "../../lib/dates";
import { Panel } from "../../ui";
import { ProgressBar } from "./ProgressBar";

import styles from "./SourcesTab.module.css";

const STATE_COPY: Record<SourceHealth["state"], string> = {
  healthy: "answering",
  degraded: "erroring",
  failing: "all failing",
  paused: "paused",
  unconfigured: "no credential",
  idle: "quiet",
};

const ATTENTION_STATES = new Set<SourceHealth["state"]>([
  "paused",
  "failing",
  "degraded",
  "unconfigured",
]);

function stamp(value: string | null) {
  return value ? (parseDatabaseDate(value)?.toLocaleString() ?? "never") : "never";
}

function stateClass(state: SourceHealth["state"]) {
  if (ATTENTION_STATES.has(state)) {
    return styles.warn;
  }

  return state === "healthy" ? styles.busy : styles.ok;
}

function rank(source: SourceHealth) {
  if (ATTENTION_STATES.has(source.state)) {
    return 0;
  }

  return source.calls > 0 ? 1 : 2;
}

function SourceRow({
  source,
  onSample,
  onResume,
}: {
  source: SourceHealth;
  onSample: (source: string) => void;
  onResume: (source: string) => void;
}) {
  const missingCredential = source.credentialState === "missing";

  return (
    <li className={styles.row}>
      <span className={styles.name}>
        <strong>{source.label}</strong>
        <span title={source.powers}>{source.powers}</span>
      </span>
      <span className={styles.calls}>
        <code>
          {source.calls.toLocaleString()} / {source.callLimit.toLocaleString()}
          {source.enforced ? " capped" : ""}
        </code>
        <ProgressBar done={source.calls} total={source.callLimit} />
      </span>
      <span className={classNames(styles.state, stateClass(source.state))}>
        {STATE_COPY[source.state]}
        {source.calls > 0 ? ` · ${source.averageLatencyMs}ms` : ""}
      </span>
      <span className={styles.actions}>
        {source.sampled && (
          <button type="button" className={styles.action} onClick={() => onSample(source.source)}>
            Sample
          </button>
        )}
        {source.pausedUntil && (
          <button type="button" className={styles.action} onClick={() => onResume(source.source)}>
            Resume
          </button>
        )}
      </span>
      {(missingCredential || source.lastError) && (
        <p className={styles.detail}>
          {missingCredential ? `${source.credential} is not set. ` : ""}
          {source.lastError ? `Last error ${stamp(source.lastErrorAt)} — ${source.lastError}` : ""}
        </p>
      )}
    </li>
  );
}

export function UpstreamPanel({
  sources,
  onSample,
  onResume,
}: {
  sources: SourceHealth[];
  onSample: (source: string) => void;
  onResume: (source: string) => void;
}) {
  const sorted = sources.toSorted(
    (left, right) => rank(left) - rank(right) || right.calls - left.calls,
  );
  const listed = sorted.filter((source) => rank(source) < 2);
  const quiet = sorted.filter((source) => rank(source) === 2);
  const attention = sorted.filter((source) => ATTENTION_STATES.has(source.state));
  const calls = sources.reduce((total, source) => total + source.calls, 0);

  return (
    <Panel heading="Upstream calls today">
      <p className={styles.summary}>
        <strong>{sources.length} sources</strong>
        <span>{calls.toLocaleString()} calls today</span>
        <span className={attention.length > 0 ? styles.alarm : undefined}>
          {attention.length > 0 ? `${attention.length} need attention` : "none need attention"}
        </span>
      </p>

      <ul className={styles.rows}>
        {listed.map((source) => (
          <SourceRow key={source.source} source={source} onSample={onSample} onResume={onResume} />
        ))}
      </ul>

      {quiet.length > 0 && (
        <details className={styles.quiet}>
          <summary className={styles.quietSummary}>{quiet.length} quiet today</summary>
          <ul className={styles.quietRows}>
            {quiet.map((source) => (
              <li key={source.source}>
                <span>{source.label}</span>
                <small>{source.lastSuccessAt ? stamp(source.lastSuccessAt) : "never called"}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

import type { AdminPipeline } from "../../hooks/useAdmin";
import { parseDatabaseDate } from "../../lib/dates";
import { Panel } from "../../ui";
import { ProgressBar } from "./ProgressBar";

import styles from "./admin.module.css";

function stamp(value: string | null) {
  return value ? (parseDatabaseDate(value)?.toLocaleString() ?? "never") : "never";
}

export function ReadinessPanel({ readiness }: { readiness: AdminPipeline["readiness"] }) {
  const { search, embeddings } = readiness;
  const projected = Math.max(0, search.titles - search.pending);

  return (
    <Panel heading="Index readiness">
      <p className={styles.note}>
        A row in the search index is not the same as a searchable title: genres, keywords and cast
        are projected from their own tables, so a title whose extensions changed after it was
        indexed is counted as waiting until the next reconcile. Embedding coverage is counted
        against the model in use, and a title that fails to embed backs off rather than holding up
        the queue behind it.
      </p>
      <ul className={styles.list}>
        <li>
          <strong>Search projection</strong>
          <small>
            {projected.toLocaleString()} of {search.titles.toLocaleString()} in step
          </small>
          {search.indexed !== search.titles && (
            <code className={styles.failed}>{search.indexed.toLocaleString()} indexed rows</code>
          )}
          {search.pending > 0 && (
            <code>{search.pending.toLocaleString()} waiting to reproject</code>
          )}
          <span className={styles.spacer} />
          {search.pending > 0 && <time>oldest queued {stamp(search.oldestPendingAt)}</time>}
          <ProgressBar done={projected} total={search.titles} />
        </li>
        <li>
          <strong>Embeddings</strong>
          <small>
            {embeddings.embedded.toLocaleString()} of {embeddings.titles.toLocaleString()} embedded
          </small>
          <small>{embeddings.model}</small>
          {embeddings.outstanding > 0 && (
            <code>{embeddings.outstanding.toLocaleString()} outstanding</code>
          )}
          {embeddings.retrying > 0 && (
            <code className={styles.failed}>
              {embeddings.retrying.toLocaleString()} backing off after a failure
            </code>
          )}
          {embeddings.otherModels > 0 && (
            <code>{embeddings.otherModels.toLocaleString()} on an older model</code>
          )}
          <span className={styles.spacer} />
          <time>{stamp(embeddings.newest)}</time>
          <ProgressBar done={embeddings.embedded} total={embeddings.titles} />
        </li>
      </ul>
    </Panel>
  );
}

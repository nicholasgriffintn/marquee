import { useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminOverview } from "../../hooks/useAdmin";
import { parseDatabaseDate } from "../../lib/dates";
import { COUNT_LABELS } from "./config";
import { ProgressBar } from "./ProgressBar";
import { SampleModal } from "./SampleModal";

type BackfillRow = {
  mediaType: string;
  status: string;
  partitions: number;
  titles: number;
  pagesDone: number;
  totalPages: number;
};

function backfillSummary(rows: BackfillRow[]) {
  const byMedia = new Map<
    string,
    {
      measured: number;
      awaiting: number;
      splitting: number;
      titles: number;
      pagesDone: number;
      totalPages: number;
    }
  >();

  for (const row of rows) {
    const entry = byMedia.get(row.mediaType) ?? {
      measured: 0,
      awaiting: 0,
      splitting: 0,
      titles: 0,
      pagesDone: 0,
      totalPages: 0,
    };

    if (row.status === "split") {
      entry.splitting += row.partitions;
    } else if (row.status === "pending" || row.status === "measuring") {
      entry.awaiting += row.partitions;
    } else {
      entry.measured += row.partitions;
      entry.titles += row.titles ?? 0;
      entry.pagesDone += row.pagesDone ?? 0;
      entry.totalPages += row.totalPages ?? 0;
    }

    byMedia.set(row.mediaType, entry);
  }

  return [...byMedia.entries()];
}

function stamp(value: string) {
  return parseDatabaseDate(value)?.toLocaleString() ?? "never";
}

type Sample = { type: "count" | "budget"; key: string; label: string };

export function OverviewTab({
  overview,
  loading,
  onResume,
}: {
  overview: AdminOverview | null;
  loading: boolean;
  onResume: (source: string) => void;
}) {
  const [sample, setSample] = useState<Sample | null>(null);

  return (
    <ErrorBoundary label="The readouts">
      <div role="tabpanel" id="admin-panel-overview" aria-labelledby="admin-tab-overview">
        {!overview && loading && (
          <p className="admin-note">
            <i className="availability-spinner" aria-hidden="true" /> Reading the pipeline…
          </p>
        )}
        {overview && (
          <section className="panel-block" aria-labelledby="admin-counts-title">
            <h2 id="admin-counts-title">Catalogue</h2>
            <p className="admin-note">
              Availability is only kept fresh for the working set — everything on a shelf or a
              pinned list, everything a rail can surface, anything with an insight or an air date
              ahead of it, plus the most popular titles. The rest of the catalogue is searchable and
              fills in its providers when something actually reaches for it. Click a number for a
              sample of what is behind it.
            </p>
            <div className="admin-counts">
              {COUNT_LABELS.map((count) => (
                <button
                  type="button"
                  key={count.key}
                  onClick={() =>
                    setSample({
                      type: "count",
                      key: count.key,
                      label: count.label,
                    })
                  }
                >
                  <strong>{(overview.catalogue[count.key] ?? 0).toLocaleString()}</strong>
                  <span>{count.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {overview && overview.backfill.length > 0 && (
          <section className="panel-block" aria-labelledby="admin-backfill-title">
            <h2 id="admin-backfill-title">Catalogue backfill</h2>
            <p className="admin-note">
              TMDB stops paginating any single query at page 500, so the sweep walks it as dated
              windows and halves any window that overflows that cap. Each window keeps its own
              cursor, so every sweep resumes the crawl instead of restarting it.
            </p>
            <ul className="admin-list">
              {backfillSummary(overview.backfill).map(([mediaType, row]) => (
                <li key={mediaType}>
                  <strong>{mediaType === "movie" ? "Films" : "Series"}</strong>
                  <small>
                    {row.pagesDone.toLocaleString()} / {row.totalPages.toLocaleString()} pages ·{" "}
                    {row.measured.toLocaleString()} of{" "}
                    {(row.measured + row.awaiting).toLocaleString()} windows mapped
                    {row.splitting > 0 ? ` · ${row.splitting.toLocaleString()} split` : ""}
                  </small>
                  <span className="spacer" />
                  <code>
                    {row.titles.toLocaleString()} titles in range
                    {row.awaiting > 0 ? " so far" : ""}
                  </code>
                  <ProgressBar done={row.pagesDone} total={row.totalPages} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {overview && overview.budgets.length > 0 && (
          <section className="panel-block" aria-labelledby="admin-budgets-title">
            <h2 id="admin-budgets-title">Call budgets</h2>
            <div className="budget-grid">
              {overview.budgets.map((budget) => (
                <div
                  key={budget.source}
                  className={`budget-cell${budget.pausedUntil ? " budget-cell-paused" : ""}`}
                >
                  <strong>{budget.source}</strong>
                  <span>
                    {budget.pausedUntil
                      ? `rate limited until ${stamp(budget.pausedUntil)}`
                      : `${budget.used.toLocaleString()} / ${budget.callLimit.toLocaleString()} per ${budget.windowKind}`}
                  </span>
                  <ProgressBar done={budget.used} total={budget.callLimit} />
                  <button
                    type="button"
                    onClick={() =>
                      setSample({
                        type: "budget",
                        key: budget.source,
                        label: budget.source,
                      })
                    }
                  >
                    See sample
                  </button>
                  {budget.pausedUntil && (
                    <button type="button" onClick={() => onResume(budget.source)}>
                      Resume now
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {sample && (
        <SampleModal
          type={sample.type}
          itemKey={sample.key}
          label={sample.label}
          onClose={() => setSample(null)}
        />
      )}
    </ErrorBoundary>
  );
}

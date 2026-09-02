import { useState } from "react";

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminOverview } from "../../hooks/useAdmin";
import { Panel, Stat, StatGrid, StatusNote, TabPanel } from "../../ui";
import { COUNT_LABELS } from "./config";
import { ProgressBar } from "./ProgressBar";
import { SampleModal } from "./SampleModal";

import styles from "./admin.module.css";

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

type Sample = { type: "count"; key: string; label: string };

export function OverviewTab({
  overview,
  loading,
}: {
  overview: AdminOverview | null;
  loading: boolean;
}) {
  const [sample, setSample] = useState<Sample | null>(null);

  return (
    <ErrorBoundary label="The readouts">
      <TabPanel id="overview" idPrefix="admin">
        {!overview && loading && <StatusNote busy>Reading the pipeline…</StatusNote>}
        {overview && (
          <Panel heading="Catalogue" rule="none">
            <p className={styles.note}>
              Availability is only kept fresh for the working set — everything on a shelf or a
              pinned list, everything a rail can surface, anything with an insight or an air date
              ahead of it, plus the most popular titles. The rest of the catalogue is searchable and
              fills in its providers when something actually reaches for it. Click a number for a
              sample of what is behind it.
            </p>
            <StatGrid min="130px">
              {COUNT_LABELS.map((count) => (
                <Stat
                  key={count.key}
                  value={(overview.catalogue[count.key] ?? 0).toLocaleString()}
                  label={count.label}
                  onClick={() =>
                    setSample({
                      type: "count",
                      key: count.key,
                      label: count.label,
                    })
                  }
                />
              ))}
            </StatGrid>
          </Panel>
        )}
        {overview && overview.backfill.length > 0 && (
          <Panel heading="Catalogue backfill" rule="top">
            <p className={styles.note}>
              TMDB stops paginating any single query at page 500, so the sweep walks it as dated
              windows and halves any window that overflows that cap. Each window keeps its own
              cursor, so every sweep resumes the crawl instead of restarting it.
            </p>
            <ul className={styles.list}>
              {backfillSummary(overview.backfill).map(([mediaType, row]) => (
                <li key={mediaType}>
                  <strong>{mediaType === "movie" ? "Films" : "Series"}</strong>
                  <small>
                    {row.pagesDone.toLocaleString()} / {row.totalPages.toLocaleString()} pages ·{" "}
                    {row.measured.toLocaleString()} of{" "}
                    {(row.measured + row.awaiting).toLocaleString()} windows mapped
                    {row.splitting > 0 ? ` · ${row.splitting.toLocaleString()} split` : ""}
                  </small>
                  <span className={styles.spacer} />
                  <code>
                    {row.titles.toLocaleString()} titles in range
                    {row.awaiting > 0 ? " so far" : ""}
                  </code>
                  <ProgressBar done={row.pagesDone} total={row.totalPages} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </TabPanel>
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

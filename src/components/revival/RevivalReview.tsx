import { useCallback, useState } from "react";

import {
  rightsSummary,
  SOURCE_LABELS,
  workMeta,
  type RevivalStatus,
  type RevivalWork,
} from "../../domain/revival";
import { useResource } from "../../hooks/useResource";
import { classNames } from "../../lib/class-names";
import { jsonMutation, mutateJson } from "../../lib/query-client";
import { Button, Callout, Chip, ExternalLinkIcon, Panel, Stat, StatGrid } from "../../ui";

import adminStyles from "../../pages/admin/admin.module.css";
import styles from "./RevivalReview.module.css";

type ReviewWork = RevivalWork & {
  status: RevivalStatus;
  mirrorState: string;
  streamUrl: string;
  streamBytes: number | null;
  discoveredAt: string;
  mirrorError: string | null;
};

type ReviewResponse = {
  status: RevivalStatus;
  works: ReviewWork[];
  stats: Record<string, number>;
};

const TABS: { id: RevivalStatus; label: string }[] = [
  { id: "candidate", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Turned away" },
];

const SOURCES = [
  { id: "", label: "Every source" },
  { id: "archive", label: "Internet Archive" },
  { id: "loc", label: "Library of Congress" },
  { id: "europeana", label: "Europeana" },
] as const;

const STAT_LABELS: { key: string; label: string }[] = [
  { key: "approved", label: "approved" },
  { key: "candidates", label: "waiting" },
  { key: "rejected", label: "turned away" },
  { key: "mirrored", label: "mirrored" },
  { key: "copying", label: "copying" },
  { key: "mirrorFailed", label: "mirror failed" },
  { key: "matched", label: "matched to a title" },
  { key: "ukClear", label: "clear in the UK" },
  { key: "ukUnknown", label: "UK term unknown" },
];

function sizeLabel(bytes: number | null) {
  if (!bytes) {
    return null;
  }

  return bytes >= 1_073_741_824
    ? `${(bytes / 1_073_741_824).toFixed(1)} GB`
    : `${Math.round(bytes / 1_048_576)} MB`;
}

export function RevivalReview({ revision: outerRevision = 0 }: { revision?: number }) {
  const [status, setStatus] = useState<RevivalStatus>("candidate");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState("");
  const { data, error: resourceError } = useResource<ReviewResponse>(
    `/api/admin/revival?status=${status}`,
    {
      errorMessage: "Could not read the review queue.",
      refreshKey: `${outerRevision}:${revision}`,
    },
  );
  const error = actionError || resourceError;

  const decide = useCallback(async (workId: string, decision: "approve" | "reject" | "mirror") => {
    setPending(workId);

    try {
      await mutateJson(
        `/api/admin/revival/${encodeURIComponent(workId)}/${decision}`,
        jsonMutation("POST"),
      );
      setActionError("");
      setRevision((current) => current + 1);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That decision did not stick.");
    } finally {
      setPending("");
    }
  }, []);

  const shown = (data?.works ?? []).filter(
    (work) =>
      (!source || work.source === source) &&
      (!query || work.title.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <Panel heading="The vault" rule="none">
      <p className={adminStyles.note}>
        Nothing plays until it is approved. A print clears on its own only when every named author
        has a death date and the last of them is more than 70 years past, or when a European archive
        has released it outright. An unknown author is not treated as no author, so anything free in
        America but not provably free here waits below for a person.
      </p>

      {data && (
        <StatGrid min="130px">
          {STAT_LABELS.filter(({ key }) => data.stats[key] !== undefined).map(({ key, label }) => (
            <Stat key={key} value={(data.stats[key] ?? 0).toLocaleString()} label={label} />
          ))}
        </StatGrid>
      )}

      <div className={adminStyles.actions}>
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={status === tab.id ? "primary" : "secondary"}
            size="md"
            onClick={() => setStatus(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {error && <Callout>{error}</Callout>}

      <div className={adminStyles.filters}>
        {SOURCES.map((entry) => (
          <Chip
            key={entry.id || "all"}
            pressed={source === entry.id}
            selected={source === entry.id}
            onClick={() => setSource(entry.id)}
          >
            {entry.label}
            <em>
              {entry.id
                ? (data?.works.filter((work) => work.source === entry.id).length ?? 0)
                : (data?.works.length ?? 0)}
            </em>
          </Chip>
        ))}
        <input
          className={adminStyles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a title"
          aria-label="Filter the vault by title"
        />
      </div>

      <ul className={classNames(adminStyles.list, styles.review)}>
        {shown.map((work) => (
          <li key={work.id}>
            <strong>{work.title}</strong>
            <small>
              {workMeta(work) || "No metadata"} · {SOURCE_LABELS[work.source]} ·{" "}
              {rightsSummary(work)}
              {sizeLabel(work.streamBytes) ? ` · ${sizeLabel(work.streamBytes)}` : ""}
              {work.mirrorState === "mirrored" ? " · mirrored" : ""}
              {work.mirrorError ? ` · ${work.mirrorError}` : ""}
            </small>
            <span className={adminStyles.spacer} />
            <a className={styles.source} href={work.sourceUrl} target="_blank" rel="noreferrer">
              Source <ExternalLinkIcon />
            </a>
            {work.status !== "approved" && (
              <button
                type="button"
                className={adminStyles.rowAction}
                disabled={pending === work.id}
                onClick={() => void decide(work.id, "approve")}
              >
                Approve
              </button>
            )}
            {work.status === "approved" && (
              <button
                type="button"
                className={adminStyles.rowAction}
                disabled={pending === work.id}
                onClick={() => void decide(work.id, "mirror")}
              >
                Re-mirror
              </button>
            )}
            {work.status !== "rejected" && (
              <button
                type="button"
                className={adminStyles.rowAction}
                disabled={pending === work.id}
                onClick={() => void decide(work.id, "reject")}
              >
                Turn away
              </button>
            )}
          </li>
        ))}
        {data && shown.length === 0 && <li className={adminStyles.empty}>Nothing in this pile.</li>}
      </ul>
    </Panel>
  );
}

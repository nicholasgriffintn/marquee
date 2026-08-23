import { useCallback, useEffect, useState } from "react";

import {
  rightsSummary,
  SOURCE_LABELS,
  workMeta,
  type RevivalStatus,
  type RevivalWork,
} from "../../domain/revival";
import { jsonRequest, requestJson } from "../../lib/api";

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
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    requestJson<ReviewResponse>(`/api/admin/revival?status=${status}`, {
      signal: controller.signal,
    })
      .then((response) => {
        setData(response);
        setError("");

        return response;
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Could not read the review queue.");
        }
      });

    return () => controller.abort();
  }, [outerRevision, revision, status]);

  const decide = useCallback(async (workId: string, decision: "approve" | "reject" | "mirror") => {
    setPending(workId);

    try {
      await requestJson(
        `/api/admin/revival/${encodeURIComponent(workId)}/${decision}`,
        jsonRequest("POST"),
      );
      setRevision((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That decision did not stick.");
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
    <section className="panel-block" aria-labelledby="admin-revival-title">
      <h2 id="admin-revival-title">The vault</h2>
      <p className="admin-note">
        Nothing plays until it is approved. A print clears on its own only when every named author
        has a death date and the last of them is more than 70 years past, or when a European archive
        has released it outright. An unknown author is not treated as no author, so anything free in
        America but not provably free here waits below for a person.
      </p>

      {data && (
        <div className="admin-counts">
          {STAT_LABELS.filter(({ key }) => data.stats[key] !== undefined).map(({ key, label }) => (
            <div key={key}>
              <strong>{(data.stats[key] ?? 0).toLocaleString()}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="admin-actions">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={status === tab.id ? "link-button-primary" : undefined}
            onClick={() => setStatus(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="auth-message" role="alert">
          {error}
        </p>
      )}

      <div className="admin-filters">
        {SOURCES.map((entry) => (
          <button
            type="button"
            key={entry.id || "all"}
            aria-pressed={source === entry.id}
            className={`admin-chip${source === entry.id ? " selected" : ""}`}
            onClick={() => setSource(entry.id)}
          >
            {entry.label}
            <em>
              {entry.id
                ? (data?.works.filter((work) => work.source === entry.id).length ?? 0)
                : (data?.works.length ?? 0)}
            </em>
          </button>
        ))}
        <input
          className="admin-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a title"
          aria-label="Filter the vault by title"
        />
      </div>

      <ul className="admin-list revival-review">
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
            <span className="spacer" />
            <a href={work.sourceUrl} target="_blank" rel="noreferrer">
              Source ↗
            </a>
            {work.status !== "approved" && (
              <button
                type="button"
                disabled={pending === work.id}
                onClick={() => void decide(work.id, "approve")}
              >
                Approve
              </button>
            )}
            {work.status === "approved" && (
              <button
                type="button"
                disabled={pending === work.id}
                onClick={() => void decide(work.id, "mirror")}
              >
                Re-mirror
              </button>
            )}
            {work.status !== "rejected" && (
              <button
                type="button"
                disabled={pending === work.id}
                onClick={() => void decide(work.id, "reject")}
              >
                Turn away
              </button>
            )}
          </li>
        ))}
        {data && shown.length === 0 && <li className="rail-empty">Nothing in this pile.</li>}
      </ul>
    </section>
  );
}

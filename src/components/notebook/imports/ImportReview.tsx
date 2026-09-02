import { useState } from "react";

import type { MediaTitle } from "../../../domain/catalog";
import type { ImportRecord, ImportRunDetail } from "../../../domain/imports";
import { queryJsonFresh } from "../../../lib/query-client";
import { Button, Callout, StatusNote } from "../../../ui";
import { Poster } from "../../Poster";

import styles from "./imports.module.css";

type CatalogueResponse = { items: MediaTitle[] };

function groupUnresolved(records: ImportRecord[]) {
  const groups = new Map<string, { record: ImportRecord; watches: number }>();

  for (const record of records) {
    const key = record.providerItemId ?? record.id;
    const group = groups.get(key);

    if (group) {
      group.watches += 1;
    } else {
      groups.set(key, { record, watches: 1 });
    }
  }

  return [...groups.values()];
}

function ReviewRecord({
  record,
  watches,
  candidates,
  busy,
  onResolve,
}: {
  record: ImportRecord;
  watches: number;
  candidates: Map<string, MediaTitle>;
  busy: boolean;
  onResolve: (
    recordId: string,
    resolution: { titleId?: string; ignore?: boolean },
  ) => Promise<void>;
}) {
  const [query, setQuery] = useState(record.title);
  const [results, setResults] = useState<MediaTitle[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  async function search() {
    if (!query.trim()) {
      return;
    }

    setSearching(true);

    try {
      const response = await queryJsonFresh<CatalogueResponse>(
        `/api/catalog/search?query=${encodeURIComponent(query.trim())}`,
      );

      setResults(response.items.slice(0, 6));
      setSelectedId("");
    } finally {
      setSearching(false);
    }
  }

  const suggestions = results.length
    ? results
    : record.candidateTitleIds.flatMap((id) => {
        const title = candidates.get(id);

        return title ? [title] : [];
      });

  return (
    <article className={styles.reviewRecord}>
      <header>
        <div>
          <strong>{record.title}</strong>
          <small>
            {[
              record.year,
              record.mediaType,
              watches > 1 ? `${watches.toLocaleString()} watches on this page` : null,
              record.watchedAt?.slice(0, 10),
            ]
              .filter(Boolean)
              .join(" · ") || "No further details"}
          </small>
        </div>
        <span>{record.matchStatus === "unmatched" ? "No exact match" : "Needs your eye"}</span>
      </header>
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          aria-label={`Search match for ${record.title}`}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={searching || busy}>
          Search
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((title) => (
            <button
              key={title.id}
              type="button"
              disabled={busy}
              className={selectedId === title.id ? styles.suggestionSelected : styles.suggestion}
              aria-pressed={selectedId === title.id}
              onClick={() => setSelectedId(title.id)}
            >
              <Poster item={title} className={styles.suggestionPoster} />
              <span>
                <strong>{title.title}</strong>
                <small>
                  {[title.year, title.mediaType === "tv" ? "Series" : "Film"]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.reviewActions}>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !selectedId}
          onClick={() => void onResolve(record.id, { titleId: selectedId })}
        >
          Use selected title
        </Button>
        <Button
          variant="quiet"
          size="sm"
          disabled={busy}
          onClick={() => void onResolve(record.id, { ignore: true })}
        >
          Don&apos;t import this
        </Button>
      </div>
    </article>
  );
}

export function ImportReview({
  detail,
  busy,
  onResolve,
  onCommit,
  onPage,
  onClose,
}: {
  detail: ImportRunDetail;
  busy: boolean;
  onResolve: (
    recordId: string,
    resolution: { titleId?: string; ignore?: boolean },
  ) => Promise<void>;
  onCommit: () => Promise<void>;
  onPage: (runId: string, offset?: number) => Promise<void>;
  onClose: () => void;
}) {
  const candidates = new Map(detail.titles.map((title) => [title.id, title]));
  const unresolved = groupUnresolved(
    detail.records.filter(
      (record) => record.matchStatus === "review" || record.matchStatus === "unmatched",
    ),
  );
  const matchedPreview = detail.records
    .filter((record) => record.matchStatus === "matched" && record.titleId)
    .slice(0, 12);
  const completed = detail.run.status === "completed";
  const writable =
    detail.run.matched > 0 &&
    (detail.run.status === "ready" || detail.run.status === "needs_review");

  return (
    <section className={styles.review} aria-labelledby="import-review-title">
      <header className={styles.reviewHead}>
        <div>
          <span>{detail.run.source.replaceAll("-", " ")}</span>
          <h3 id="import-review-title">
            {completed ? "Import complete" : "Preview before writing"}
          </h3>
        </div>
        <Button variant="quiet" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className={styles.totals}>
        <span>
          <strong>{detail.run.matched}</strong> matched
        </span>
        <span>
          <strong>{detail.run.review}</strong> to review
        </span>
        <span>
          <strong>{detail.run.skipped}</strong> skipped
        </span>
        <span>
          <strong>{detail.run.duplicate}</strong> duplicate
        </span>
        <span>
          <strong>{detail.run.committed}</strong> written
        </span>
      </div>

      {detail.run.status === "failed" && (
        <Callout>{detail.run.errorDetail ?? "That import failed."}</Callout>
      )}

      {!completed && matchedPreview.length > 0 && (
        <details className={styles.matchedPreview}>
          <summary>Preview matched titles on this page</summary>
          <ul>
            {matchedPreview.map((record) => {
              const title = record.titleId ? candidates.get(record.titleId) : null;

              return (
                <li key={record.id}>
                  <strong>{title?.title ?? record.title}</strong>
                  <small>
                    {[title?.year ?? record.year, record.matchMethod?.replaceAll("_", " ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {unresolved.map((group) => (
        <ReviewRecord
          key={group.record.id}
          record={group.record}
          watches={group.watches}
          candidates={candidates}
          busy={busy}
          onResolve={onResolve}
        />
      ))}

      {(detail.recordPage.offset > 0 || detail.recordPage.hasMore) && (
        <nav className={styles.pagination} aria-label="Import records pages">
          <Button
            variant="quiet"
            size="sm"
            disabled={busy || detail.recordPage.offset === 0}
            onClick={() =>
              void onPage(
                detail.run.id,
                Math.max(0, detail.recordPage.offset - detail.recordPage.limit),
              )
            }
          >
            Previous records
          </Button>
          <small>
            Records {detail.recordPage.offset + 1}–
            {detail.recordPage.offset + detail.records.length}
          </small>
          <Button
            variant="quiet"
            size="sm"
            disabled={busy || !detail.recordPage.hasMore}
            onClick={() =>
              void onPage(detail.run.id, detail.recordPage.offset + detail.recordPage.limit)
            }
          >
            Next records
          </Button>
        </nav>
      )}

      {!completed && writable && (
        <div className={styles.commitBar}>
          <p>
            <strong>{detail.run.matched.toLocaleString()} records are ready.</strong>
            <small>
              {detail.run.review > 0
                ? `Write these now; the ${detail.run.review.toLocaleString()} awaiting your eye stay here until you resolve them.`
                : "Nothing changes on your shelf until you confirm."}
            </small>
          </p>
          <Button variant="primary" disabled={busy} onClick={() => void onCommit()}>
            Write {detail.run.review > 0 ? "the matched titles" : "this history"}
          </Button>
        </div>
      )}

      {!completed && detail.run.review > 0 && detail.run.matched === 0 && (
        <StatusNote>
          Resolve or ignore the remaining titles to write the rest of this import.
        </StatusNote>
      )}
    </section>
  );
}

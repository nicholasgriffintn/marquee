import { useState } from "react";

import { IMPORT_RECORD_LIMIT, type ImportSource } from "../../../domain/imports";
import type { TraktImportLink } from "../../../hooks/useTraktImport";
import { IMPORT_CHOICES, readImportFiles } from "../../../importers/registry";
import { STRUCTURED_CSV_EXAMPLE, STRUCTURED_JSON_EXAMPLE } from "../../../importers/structured";
import type { ParsedImport } from "../../../importers/types";
import { parseFilesInWorker } from "../../../importers/worker-client";
import { downloadTextFile } from "../../../lib/download";
import { Button, Callout, StatusNote } from "../../../ui";

import styles from "./imports.module.css";

type TraktImport = {
  link: TraktImportLink | null;
  status: "idle" | "running" | "done" | "timeout";
  sync: () => Promise<void>;
};

const INSTRUCTIONS: Partial<
  Record<ImportSource, { steps: string[]; links?: { label: string; href: string }[] }>
> = {
  imdb: {
    steps: [
      "Sign in to IMDb and open your watchlist.",
      "Choose Export, then do the same from your ratings page if you want ratings too.",
      "Select one or both CSV files below.",
    ],
    links: [
      { label: "IMDb watchlist", href: "https://www.imdb.com/list/watchlist" },
      { label: "IMDb ratings", href: "https://www.imdb.com/list/ratings" },
    ],
  },
  letterboxd: {
    steps: [
      "Sign in to Letterboxd and open the data export page.",
      "Choose Export your data and wait for the download.",
      "Upload the downloaded ZIP directly—do not unpack it.",
    ],
    links: [{ label: "Letterboxd export settings", href: "https://letterboxd.com/data/export/" }],
  },
  trakt: {
    steps: [
      "Connect your Trakt account if it is not linked yet.",
      "Start an import to fetch history, ratings, watchlist, and episode progress.",
      "Review uncertain matches before anything is written to your shelf.",
    ],
  },
  json: {
    steps: [
      "Create a JSON array with one object per title or episode.",
      "Identify items with imdb_id, tmdb_id, or tvdb_id; include type and title when possible.",
      "Add watched_at, watchlisted_at, rating, and rated_at as needed, then upload the file.",
    ],
  },
  csv: {
    steps: [
      "Start with the example CSV and keep its header row.",
      "Use one row per title or episode; ratings use a 1–10 scale.",
      "Save as CSV and upload it below.",
    ],
  },
};

function FormatGuide({ source }: { source: "json" | "csv" }) {
  const example = source === "json" ? STRUCTURED_JSON_EXAMPLE : STRUCTURED_CSV_EXAMPLE;
  const name = `marquee-import-example.${source}`;

  return (
    <details className={styles.formatGuide}>
      <summary>Format and example</summary>
      <p>
        Fields: <code>imdb_id</code>, <code>tmdb_id</code>, <code>tvdb_id</code>, <code>type</code>,{" "}
        <code>title</code>, <code>year</code>, <code>season</code>, <code>episode</code>,{" "}
        <code>watched_at</code>, <code>watchlisted_at</code>, <code>rating</code>, and{" "}
        <code>rated_at</code>. Dates use ISO 8601; <code>watched_at</code> may be{" "}
        <code>unknown</code>.
      </p>
      <pre>{example}</pre>
      <Button
        variant="quiet"
        size="sm"
        onClick={() =>
          downloadTextFile(name, example, source === "json" ? "application/json" : "text/csv")
        }
      >
        Download example
      </Button>
    </details>
  );
}

export function ImportWizard({
  busy,
  progress,
  trakt,
  onSubmit,
}: {
  busy: boolean;
  progress: string;
  trakt: TraktImport;
  onSubmit: (parsed: ParsedImport) => Promise<void>;
}) {
  const [source, setSource] = useState<ImportSource>("imdb");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState("");
  const choice = IMPORT_CHOICES.find((candidate) => candidate.id === source);
  const guide = INSTRUCTIONS[source];

  if (!choice || !guide) {
    return null;
  }

  function choose(next: ImportSource) {
    setSource(next);
    setParsed(null);
    setError("");
  }

  async function inspect(files: FileList | null) {
    setError("");
    setParsed(null);

    try {
      const result = await parseFilesInWorker(source, await readImportFiles(files ?? []));

      if (result.records.length === 0) {
        throw new Error("Nothing recognisable was found in that export.");
      }

      if (result.records.length > IMPORT_RECORD_LIMIT) {
        throw new Error(
          `That export contains more than ${IMPORT_RECORD_LIMIT.toLocaleString()} activities.`,
        );
      }

      setParsed(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That export could not be read.");
    }
  }

  return (
    <section className={styles.wizard} aria-labelledby="import-source-title">
      <header className={styles.wizardHead}>
        <div>
          <span>Import from</span>
          <h3 id="import-source-title">Choose where your history lives</h3>
        </div>
        <div className={styles.sourceTabs} aria-label="Import source">
          {IMPORT_CHOICES.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={candidate.id === source ? styles.sourceActive : styles.source}
              aria-pressed={candidate.id === source}
              onClick={() => choose(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </header>

      <div className={styles.guide}>
        <div className={styles.guideCopy}>
          <h4>{choice.label}</h4>
          <p>{choice.description}</p>
          <ol>
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.links && (
            <div className={styles.guideLinks}>
              {guide.links.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ))}
            </div>
          )}
          {(source === "json" || source === "csv") && <FormatGuide source={source} />}
        </div>

        <div className={styles.importAction}>
          {choice.mode === "connection" ? (
            trakt.link?.available === false ? (
              <StatusNote>Trakt is not configured on this deployment.</StatusNote>
            ) : trakt.link?.connected && trakt.link.needsReconnect ? (
              <>
                <StatusNote>Trakt needs to be reconnected before another import.</StatusNote>
                <a
                  className={styles.connectButton}
                  href="/api/links/trakt/start?returnTo=/notebook"
                >
                  Reconnect Trakt
                </a>
              </>
            ) : trakt.link?.connected ? (
              <>
                <p>
                  <strong>
                    {trakt.link.account ? `Connected as ${trakt.link.account}` : "Connected"}
                  </strong>
                  <small>
                    {trakt.status === "running"
                      ? "Fetching and matching your Trakt history…"
                      : trakt.status === "done"
                        ? "Ready in previous imports below."
                        : trakt.status === "timeout"
                          ? "Still working in the background."
                          : "You can import again whenever your Trakt history changes."}
                  </small>
                </p>
                <Button
                  variant="primary"
                  disabled={trakt.status === "running"}
                  onClick={() => void trakt.sync()}
                >
                  Import from Trakt
                </Button>
              </>
            ) : (
              <a className={styles.connectButton} href="/api/links/trakt/start?returnTo=/notebook">
                Connect Trakt
              </a>
            )
          ) : (
            <label className={styles.drop}>
              <input
                aria-label={`Choose ${choice.label} export`}
                className={styles.fileInput}
                type="file"
                accept={choice.accept}
                multiple={choice.multiple}
                disabled={busy}
                onChange={(event) => void inspect(event.target.files)}
              />
              <span>
                <strong>
                  Choose {choice.label} file{choice.multiple ? "s" : ""}
                </strong>
                <small>Files are read locally; only normalised activities are uploaded.</small>
              </span>
            </label>
          )}
        </div>
      </div>

      {parsed && (
        <div className={styles.preview}>
          <span className={styles.count}>{parsed.records.length.toLocaleString()}</span>
          <p>
            <strong>activities ready to preview</strong>
            <small>
              {parsed.records
                .filter((record) => record.eventTypes.includes("watched"))
                .length.toLocaleString()}{" "}
              watches ·{" "}
              {parsed.records
                .filter((record) => record.eventTypes.includes("rated"))
                .length.toLocaleString()}{" "}
              ratings
            </small>
          </p>
          <Button variant="primary" disabled={busy} onClick={() => void onSubmit(parsed)}>
            Match and preview
          </Button>
        </div>
      )}

      {error && <Callout>{error}</Callout>}
      {progress && <StatusNote busy>{progress}</StatusNote>}
    </section>
  );
}

import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { RevivalReview } from "../components/revival/RevivalReview";
import { UsherMark } from "../components/usher/UsherMark";
import { useAdmin, type AdminAction } from "../hooks/useAdmin";
import type { User } from "../types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "actions", label: "Actions" },
  { id: "pipeline", label: "Pipeline" },
  { id: "listings", label: "Listings" },
  { id: "vault", label: "The vault" },
  { id: "people", label: "People" },
] as const;

type AdminTab = (typeof TABS)[number]["id"];

const READS_DATA = new Set<AdminTab>(["overview", "pipeline", "listings", "vault", "people"]);

const RUN_STATUSES = ["all", "completed", "failed", "running"] as const;

type RunStatus = (typeof RUN_STATUSES)[number];

const PEOPLE_SEARCH_FROM = 8;

const ACTION_GROUPS: {
  title: string;
  note: string;
  actions: { id: AdminAction; label: string }[];
}[] = [
  {
    title: "Schedules",
    note: "The same workflows the crons start. A light sweep runs every three hours, a deep sweep nightly, the digest on Monday mornings. Every sweep advances the catalogue backfill by a bounded number of pages.",
    actions: [
      { id: "sweep-light", label: "Run light sweep" },
      { id: "sweep-deep", label: "Run deep sweep" },
      { id: "digest", label: "Rebuild digests" },
    ],
  },
  {
    title: "Backfills",
    note: "Queue work without waiting for a sweep. Each one respects the call budgets below. The backfill walks TMDB in dated windows, so every run picks up where the last one stopped.",
    actions: [
      { id: "availability", label: "Refresh availability" },
      { id: "enrichment", label: "Queue enrichment" },
      { id: "embeddings", label: "Queue embeddings" },
      { id: "discover", label: "Advance backfill" },
    ],
  },
  {
    title: "Rebuilds",
    note: "Fast jobs that go straight onto the ingestion queue.",
    actions: [
      { id: "sections", label: "Rebuild homepage" },
      { id: "working-set", label: "Rebuild working set" },
      { id: "schedule", label: "Refresh air dates" },
      { id: "buzz", label: "Refresh trending" },
      { id: "providers", label: "Refresh providers" },
    ],
  },
  {
    title: "The post",
    note: "Alerts only go to members who have confirmed an address, never more than a handful a week, and never twice about the same thing. Preview runs every detector and reports what would go out without posting anything.",
    actions: [
      { id: "alerts-preview", label: "Preview the post" },
      { id: "alerts-send", label: "Send the post" },
      { id: "angle-scores", label: "Rescore shelves" },
      { id: "people", label: "Reindex credits" },
    ],
  },
  {
    title: "The revival house",
    note: "Public domain prints from European archives, the Internet Archive and the Library of Congress. The UK term runs 70 years from the death of the last author, so a work is matched to the catalogue, checked against Wikidata for its authors' death dates, and only then cleared. Everything unresolved waits in the queue below. Mirroring copies an approved print into our own bucket, one chunk per run.",
    actions: [
      { id: "revival-sweep", label: "Sweep the sources" },
      { id: "revival-match", label: "Match to catalogue" },
      { id: "revival-rights", label: "Check UK rights" },
      { id: "revival-mirror", label: "Mirror approved prints" },
    ],
  },
  {
    title: "The other houses",
    note: "Cinema listings come from the chains that publish them. The directory is refreshed on a deep sweep; listings are only pulled for cinemas near somewhere a member has actually looked from, so the work grows with the audience rather than with the country.",
    actions: [
      { id: "cinemas", label: "Refresh cinema directory" },
      { id: "showtimes", label: "Pull local listings" },
    ],
  },
];

const COUNT_LABELS: { key: string; label: string }[] = [
  { key: "titles", label: "titles" },
  { key: "movies", label: "films" },
  { key: "shows", label: "series" },
  { key: "workingSet", label: "tracked for availability" },
  { key: "availabilityFresh", label: "availability fresh" },
  { key: "embeddings", label: "embedded" },
  { key: "posters", label: "posters cached" },
  { key: "buzz", label: "buzz measured" },
  { key: "upcoming", label: "episodes ahead" },
  { key: "sections", label: "homepage rails" },
  { key: "cinemas", label: "cinemas" },
  { key: "cinemasPlaced", label: "cinemas placed" },
  { key: "cinemaFilms", label: "cinema films" },
  { key: "screenings", label: "screenings ahead" },
  { key: "interestCells", label: "places looked from" },
  { key: "users", label: "accounts" },
  { key: "alertReady", label: "confirmed addresses" },
  { key: "alertsWeek", label: "alerts this week" },
  { key: "alertsSent", label: "alerts all time" },
  { key: "signals", label: "signals recorded" },
  { key: "beliefs", label: "beliefs held" },
];

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

function cinemaTotals(rows: { cinemas: number; located: number; screenings: number }[]) {
  const cinemas = rows.reduce((total, row) => total + row.cinemas, 0);
  const located = rows.reduce((total, row) => total + row.located, 0);
  const screenings = rows.reduce((total, row) => total + row.screenings, 0);

  return `${cinemas.toLocaleString()} cinemas across ${rows.length.toLocaleString()} chains, ${located.toLocaleString()} of them placed on a map, ${screenings.toLocaleString()} screenings ahead.`;
}

function stamp(value: string) {
  return value ? new Date(`${value.replace(" ", "T")}Z`).toLocaleString() : "never";
}

export function AdminPage({ user }: { user: User }) {
  const admin = useAdmin(true);
  const { overview } = admin;
  const [params, setParams] = useSearchParams();
  const [runStatus, setRunStatus] = useState<RunStatus>("all");
  const [personQuery, setPersonQuery] = useState("");
  const [vaultRevision, setVaultRevision] = useState(0);
  const tab = TABS.find((entry) => entry.id === params.get("tab"))?.id ?? "overview";

  function selectTab(next: AdminTab) {
    const merged = new URLSearchParams(params);

    merged.set("tab", next);
    setParams(merged, { replace: true });
  }

  function refreshTab() {
    if (tab === "vault") {
      setVaultRevision((current) => current + 1);

      return;
    }

    void admin.refresh();
  }

  const runs = (overview?.lastRuns ?? []).filter(
    (run) => runStatus === "all" || run.status === runStatus,
  );
  const people = admin.users.filter((person) =>
    personQuery
      ? `${person.name} ${person.login}`.toLowerCase().includes(personQuery.trim().toLowerCase())
      : true,
  );

  return (
    <section className="page-section admin-page">
      <div className="page-title-row">
        <div>
          <h1>
            Admin, and <em>the state of the pipeline.</em>
          </h1>
        </div>
        <p>
          Signed in as {user.name}. Actions here queue real work against the live catalogue and
          spend the API budgets shown below.
        </p>
      </div>

      <aside className="projection-note">
        <UsherMark face="thinking" crop="head" />
        <p>
          <strong>The projection box.</strong> He does the reels, the sweeps and the long nights of
          re-hydrating{" "}
          {overview ? `${(overview.catalogue.titles ?? 0).toLocaleString()} records` : "the lot"}. I
          do the door. We have not spoken since 1988.
        </p>
      </aside>

      {admin.error && (
        <p className="catalogue-error" role="alert">
          {admin.error}
        </p>
      )}
      <p className={`sync-message${admin.message ? " visible" : ""}`} aria-live="polite">
        {admin.message}
      </p>

      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            role="tab"
            id={`admin-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`admin-panel-${entry.id}`}
            className={`admin-tab${tab === entry.id ? " selected" : ""}`}
            onClick={() => selectTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
        <span className="spacer" />
        {READS_DATA.has(tab) && (
          <button type="button" className="admin-refresh" onClick={refreshTab}>
            Refresh
            {overview && tab !== "vault" && (
              <em>read {new Date(overview.fetchedAt).toLocaleTimeString()}</em>
            )}
          </button>
        )}
      </div>

      {tab === "overview" && (
        <ErrorBoundary label="The readouts">
          <div role="tabpanel" id="admin-panel-overview" aria-labelledby="admin-tab-overview">
            {overview && (
              <section className="panel-block" aria-labelledby="admin-counts-title">
                <h2 id="admin-counts-title">Catalogue</h2>
                <p className="admin-note">
                  Availability is only kept fresh for the working set — everything on a shelf or a
                  pinned list, everything a rail can surface, anything with an insight or an air
                  date ahead of it, plus the most popular titles. The rest of the catalogue is
                  searchable and fills in its providers when something actually reaches for it.
                </p>
                <div className="admin-counts">
                  {COUNT_LABELS.map((count) => (
                    <div key={count.key}>
                      <strong>{(overview.catalogue[count.key] ?? 0).toLocaleString()}</strong>
                      <span>{count.label}</span>
                    </div>
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
                      <div className="budget-bar" aria-hidden="true">
                        <i
                          style={{
                            width: `${Math.min(100, (row.pagesDone / Math.max(1, row.totalPages)) * 100)}%`,
                          }}
                        />
                      </div>
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
                      <div className="budget-bar" aria-hidden="true">
                        <i
                          style={{
                            width: `${Math.min(100, (budget.used / Math.max(1, budget.callLimit)) * 100)}%`,
                          }}
                        />
                      </div>
                      {budget.pausedUntil && (
                        <button type="button" onClick={() => void admin.resume(budget.source)}>
                          Resume now
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </ErrorBoundary>
      )}

      {tab === "actions" && (
        <ErrorBoundary label="The controls">
          <div role="tabpanel" id="admin-panel-actions" aria-labelledby="admin-tab-actions">
            {ACTION_GROUPS.map((group) => (
              <section className="panel-block" key={group.title} aria-label={group.title}>
                <h2>{group.title}</h2>
                <p className="admin-note">{group.note}</p>
                <div className="admin-actions">
                  {group.actions.map((action) => (
                    <button
                      type="button"
                      key={action.id}
                      className="link-button-primary"
                      disabled={Boolean(admin.pending)}
                      onClick={() => void admin.run(action.id)}
                    >
                      {admin.pending === action.id ? "Starting…" : action.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ErrorBoundary>
      )}

      {tab === "pipeline" && (
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
                        {run.subjects < run.runs
                          ? ` · ${run.subjects.toLocaleString()} unique`
                          : ""}
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
                  {overview.enrichment.map((source) => (
                    <li key={source.source}>
                      <strong>{source.source}</strong>
                      <small>{source.titles.toLocaleString()} titles</small>
                      {source.misses > 0 && <code>{source.misses.toLocaleString()} no data</code>}
                      <span className="spacer" />
                      <time dateTime={source.newest}>{stamp(source.newest)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </ErrorBoundary>
      )}

      {tab === "listings" && (
        <ErrorBoundary label="The listings">
          <div role="tabpanel" id="admin-panel-listings" aria-labelledby="admin-tab-listings">
            {overview && overview.sections.length > 0 && (
              <section className="panel-block" aria-labelledby="admin-sections-title">
                <h2 id="admin-sections-title">Homepage rails</h2>
                <ul className="admin-list">
                  {overview.sections.map((section) => (
                    <li key={section.id}>
                      <strong>{section.title}</strong>
                      <small>{section.titles} titles</small>
                      <span className="spacer" />
                      <code>{section.id}</code>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {overview && (
              <section className="panel-block" aria-labelledby="admin-cinemas-title">
                <h2 id="admin-cinemas-title">Cinema listings</h2>
                <p className="admin-note">
                  {cinemaTotals(overview.cinemas)} A cinema without coordinates never shows up in a
                  nearby search, and listings are only pulled for the{" "}
                  {(overview.catalogue.interestCells ?? 0).toLocaleString()} places a member has
                  looked from in the last thirty days — with none of those, Pull local listings has
                  nothing to queue.
                </p>
                {overview.cinemas.length > 0 ? (
                  <ul className="admin-list">
                    {overview.cinemas.map((row) => (
                      <li key={row.source}>
                        <strong>{row.source}</strong>
                        <small>
                          {row.located.toLocaleString()} of {row.cinemas.toLocaleString()} placed
                        </small>
                        {row.cinemas > row.located && (
                          <code>{(row.cinemas - row.located).toLocaleString()} unplaced</code>
                        )}
                        <small>
                          {row.matched.toLocaleString()} / {row.films.toLocaleString()} films
                          matched
                        </small>
                        <span className="spacer" />
                        <small>{row.screenings.toLocaleString()} ahead</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-note">
                    No directory yet. Run Refresh cinema directory to pull the chains.
                  </p>
                )}
              </section>
            )}
          </div>
        </ErrorBoundary>
      )}

      {tab === "vault" && (
        <ErrorBoundary label="The vault">
          <div role="tabpanel" id="admin-panel-vault" aria-labelledby="admin-tab-vault">
            <RevivalReview revision={vaultRevision} />
          </div>
        </ErrorBoundary>
      )}

      {tab === "people" && (
        <ErrorBoundary label="The staff list">
          <div role="tabpanel" id="admin-panel-people" aria-labelledby="admin-tab-people">
            <section className="panel-block" aria-labelledby="admin-users-title">
              <h2 id="admin-users-title">People</h2>
              {admin.users.length >= PEOPLE_SEARCH_FROM && (
                <div className="admin-filters">
                  <input
                    className="admin-search"
                    value={personQuery}
                    onChange={(event) => setPersonQuery(event.target.value)}
                    placeholder="Find a name or login"
                    aria-label="Filter people"
                  />
                </div>
              )}
              <ul className="admin-list">
                {people.map((person) => (
                  <li key={person.id}>
                    {person.avatarUrl ? (
                      <img className="admin-avatar" src={person.avatarUrl} alt="" />
                    ) : (
                      <span className="avatar-fallback">{person.name.slice(0, 1)}</span>
                    )}
                    <strong>{person.name}</strong>
                    <small>
                      @{person.login} · {person.shelfEntries} saved
                    </small>
                    <span className="spacer" />
                    <span className={`role-badge role-badge-${person.role}`}>{person.role}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void admin.changeRole(
                          person.id,
                          person.role === "admin" ? "viewer" : "admin",
                        )
                      }
                    >
                      {person.role === "admin" ? "Make viewer" : "Make admin"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </ErrorBoundary>
      )}

      {overview && (
        <p className="admin-note">
          Read at {new Date(overview.fetchedAt).toLocaleTimeString()} ·{" "}
          <button type="button" className="link-inline" onClick={() => void admin.refresh()}>
            Refresh
          </button>
        </p>
      )}
    </section>
  );
}

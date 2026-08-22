import { useAdmin, type AdminAction } from "../hooks/useAdmin";
import type { User } from "../types";

const ACTION_GROUPS: {
  title: string;
  note: string;
  actions: { id: AdminAction; label: string }[];
}[] = [
  {
    title: "Schedules",
    note: "The same workflows the crons start. A light sweep runs every three hours, a deep sweep nightly, the digest on Monday mornings.",
    actions: [
      { id: "sweep-light", label: "Run light sweep" },
      { id: "sweep-deep", label: "Run deep sweep" },
      { id: "digest", label: "Rebuild digests" },
    ],
  },
  {
    title: "Backfills",
    note: "Queue work without waiting for a sweep. Each one respects the call budgets below.",
    actions: [
      { id: "availability", label: "Refresh availability" },
      { id: "enrichment", label: "Queue enrichment" },
      { id: "embeddings", label: "Queue embeddings" },
      { id: "discover", label: "Sweep discover pages" },
    ],
  },
  {
    title: "Rebuilds",
    note: "Fast jobs that go straight onto the ingestion queue.",
    actions: [
      { id: "sections", label: "Rebuild homepage" },
      { id: "schedule", label: "Refresh air dates" },
      { id: "buzz", label: "Refresh trending" },
      { id: "providers", label: "Refresh providers" },
    ],
  },
];

const COUNT_LABELS: { key: string; label: string }[] = [
  { key: "titles", label: "titles" },
  { key: "movies", label: "films" },
  { key: "shows", label: "series" },
  { key: "availabilityFresh", label: "availability fresh" },
  { key: "embeddings", label: "embedded" },
  { key: "posters", label: "posters cached" },
  { key: "buzz", label: "buzz measured" },
  { key: "upcoming", label: "episodes ahead" },
  { key: "sections", label: "homepage rails" },
  { key: "users", label: "accounts" },
];

function stamp(value: string) {
  return value ? new Date(`${value.replace(" ", "T")}Z`).toLocaleString() : "never";
}

export function AdminPage({ user }: { user: User }) {
  const admin = useAdmin(true);
  const { overview } = admin;

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

      {admin.error && (
        <p className="catalogue-error" role="alert">
          {admin.error}
        </p>
      )}
      <p className={`sync-message${admin.message ? " visible" : ""}`} aria-live="polite">
        {admin.message}
      </p>

      {overview && (
        <section className="panel-block" aria-labelledby="admin-counts-title">
          <h2 id="admin-counts-title">Catalogue</h2>
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

      {overview && overview.enrichment.length > 0 && (
        <section className="panel-block" aria-labelledby="admin-enrichment-title">
          <h2 id="admin-enrichment-title">Enrichment coverage</h2>
          <ul className="admin-list">
            {overview.enrichment.map((source) => (
              <li key={source.source}>
                <strong>{source.source}</strong>
                <small>{source.titles.toLocaleString()} titles</small>
                <span className="spacer" />
                <time dateTime={source.newest}>{stamp(source.newest)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {overview && overview.lastRuns.length > 0 && (
        <section className="panel-block" aria-labelledby="admin-runs-title">
          <h2 id="admin-runs-title">Recent jobs</h2>
          <ul className="admin-list">
            {overview.lastRuns.map((run) => (
              <li key={`${run.jobType}-${run.status}`}>
                <strong>{run.jobType}</strong>
                <small className={`run-status run-status-${run.status}`}>
                  {run.status} · {run.runs.toLocaleString()}
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

      <section className="panel-block" aria-labelledby="admin-users-title">
        <h2 id="admin-users-title">People</h2>
        <ul className="admin-list">
          {admin.users.map((person) => (
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
                  void admin.changeRole(person.id, person.role === "admin" ? "viewer" : "admin")
                }
              >
                {person.role === "admin" ? "Make viewer" : "Make admin"}
              </button>
            </li>
          ))}
        </ul>
      </section>

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

import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { PageTitle } from "../components/PageTitle";
import { RevivalReview } from "../components/revival/RevivalReview";
import { UsherMark } from "../components/usher/UsherMark";
import { useAdmin } from "../hooks/useAdmin";
import { formatTime } from "../lib/dates";
import type { User } from "../types";
import { ActionsTab } from "./admin/ActionsTab";
import { READS_DATA, TABS, type AdminTab } from "./admin/config";
import { ListingsTab } from "./admin/ListingsTab";
import { OverviewTab } from "./admin/OverviewTab";
import { PeopleTab } from "./admin/PeopleTab";
import { PipelineTab } from "./admin/PipelineTab";

export function AdminPage({ user }: { user: User }) {
  const admin = useAdmin(true);
  const { overview } = admin;
  const [params, setParams] = useSearchParams();
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

  return (
    <section className="page-section admin-page">
      <PageTitle
        heading={
          <>
            Admin, and <em>the state of the pipeline.</em>
          </>
        }
      >
        <p>
          Signed in as {user.name}. Actions here queue real work against the live catalogue and
          spend the API budgets shown below.
        </p>
      </PageTitle>

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
            {overview && tab !== "vault" && <em>read {formatTime(overview.fetchedAt, {})}</em>}
          </button>
        )}
      </div>

      {tab === "overview" && (
        <OverviewTab overview={overview} onResume={(source) => void admin.resume(source)} />
      )}

      {tab === "actions" && (
        <ActionsTab pending={admin.pending} onRun={(action) => void admin.run(action)} />
      )}

      {tab === "pipeline" && <PipelineTab overview={overview} />}

      {tab === "listings" && <ListingsTab overview={overview} />}

      {tab === "vault" && (
        <ErrorBoundary label="The vault">
          <div role="tabpanel" id="admin-panel-vault" aria-labelledby="admin-tab-vault">
            <RevivalReview revision={vaultRevision} />
          </div>
        </ErrorBoundary>
      )}

      {tab === "people" && (
        <PeopleTab
          users={admin.users}
          onChangeRole={(userId, role) => void admin.changeRole(userId, role)}
        />
      )}

      {overview && (
        <p className="admin-note">
          Read at {formatTime(overview.fetchedAt, {})} ·{" "}
          <button type="button" className="link-inline" onClick={() => void admin.refresh()}>
            Refresh
          </button>
        </p>
      )}
    </section>
  );
}

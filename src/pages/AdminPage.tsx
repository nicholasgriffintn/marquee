import { useEffect, useRef, useState } from "react";
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
  const [pipelineRevision, setPipelineRevision] = useState(0);
  const [listingsRevision, setListingsRevision] = useState(0);
  const tab = TABS.find((entry) => entry.id === params.get("tab"))?.id ?? "overview";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { usersLoaded, loadUsers } = admin;

  useEffect(() => {
    if (tab === "people" && !usersLoaded) {
      void loadUsers();
    }
  }, [tab, usersLoaded, loadUsers]);

  function selectTab(next: AdminTab) {
    const merged = new URLSearchParams(params);

    merged.set("tab", next);
    setParams(merged, { replace: true });
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : null;

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    selectTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  function refreshTab() {
    if (tab === "vault") {
      setVaultRevision((current) => current + 1);

      return;
    }

    if (tab === "pipeline") {
      setPipelineRevision((current) => current + 1);

      return;
    }

    if (tab === "listings") {
      setListingsRevision((current) => current + 1);

      return;
    }

    if (tab === "people") {
      void admin.loadUsers();

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
        {TABS.map((entry, index) => (
          <button
            type="button"
            key={entry.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            id={`admin-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`admin-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            className={`admin-tab${tab === entry.id ? " selected" : ""}`}
            onClick={() => selectTab(entry.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {entry.label}
          </button>
        ))}
        <span className="spacer" />
        {READS_DATA.has(tab) && (
          <button type="button" className="admin-refresh" onClick={refreshTab}>
            Refresh
            {overview && tab === "overview" && <em>read {formatTime(overview.fetchedAt, {})}</em>}
          </button>
        )}
      </div>

      {tab === "overview" && (
        <div role="tabpanel" id="admin-panel-overview" aria-labelledby="admin-tab-overview">
          <OverviewTab
            overview={overview}
            loading={admin.loading}
            onResume={(source) => void admin.resume(source)}
          />
        </div>
      )}

      {tab === "actions" && (
        <div role="tabpanel" id="admin-panel-actions" aria-labelledby="admin-tab-actions">
          <ActionsTab pending={admin.pending} onRun={(action) => void admin.run(action)} />
        </div>
      )}

      {tab === "pipeline" && (
        <div role="tabpanel" id="admin-panel-pipeline" aria-labelledby="admin-tab-pipeline">
          <PipelineTab overview={overview} revision={pipelineRevision} />
        </div>
      )}

      {tab === "listings" && (
        <div role="tabpanel" id="admin-panel-listings" aria-labelledby="admin-tab-listings">
          <ListingsTab overview={overview} revision={listingsRevision} />
        </div>
      )}

      {tab === "vault" && (
        <ErrorBoundary label="The vault">
          <div role="tabpanel" id="admin-panel-vault" aria-labelledby="admin-tab-vault">
            <RevivalReview revision={vaultRevision} />
          </div>
        </ErrorBoundary>
      )}

      {tab === "people" && (
        <div role="tabpanel" id="admin-panel-people" aria-labelledby="admin-tab-people">
          <PeopleTab
            users={admin.users}
            onChangeRole={(userId, role) => void admin.changeRole(userId, role)}
          />
        </div>
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

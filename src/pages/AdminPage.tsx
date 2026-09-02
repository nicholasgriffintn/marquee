import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { RevivalReview } from "../components/revival/RevivalReview";
import { UsherMark } from "../components/usher/UsherMark";
import { useAdmin } from "../hooks/useAdmin";
import { classNames } from "../lib/class-names";
import { formatTime } from "../lib/dates";
import type { User } from "../types";
import { Callout, Page, PageHeader, TabList, Text } from "../ui";
import { ActionsTab } from "./admin/ActionsTab";
import { READS_DATA, TABS, type AdminTab } from "./admin/config";
import { ListingsTab } from "./admin/ListingsTab";
import { OverviewTab } from "./admin/OverviewTab";
import { PeopleTab } from "./admin/PeopleTab";
import { PipelineTab } from "./admin/PipelineTab";
import { QualityTab } from "./admin/QualityTab";
import { RoomsTab } from "./admin/RoomsTab";
import { SourcesTab } from "./admin/SourcesTab";

import adminStyles from "./admin/admin.module.css";
import styles from "./AdminPage.module.css";

export function AdminPage({ user }: { user: User }) {
  const admin = useAdmin(true);
  const { overview } = admin;
  const [params, setParams] = useSearchParams();
  const [vaultRevision, setVaultRevision] = useState(0);
  const [pipelineRevision, setPipelineRevision] = useState(0);
  const [listingsRevision, setListingsRevision] = useState(0);
  const [qualityRevision, setQualityRevision] = useState(0);
  const [sourcesRevision, setSourcesRevision] = useState(0);
  const tab = TABS.find((entry) => entry.id === params.get("tab"))?.id ?? "overview";

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

    if (tab === "quality") {
      setQualityRevision((current) => current + 1);

      return;
    }

    if (tab === "sources") {
      setSourcesRevision((current) => current + 1);

      return;
    }

    if (tab === "people") {
      void admin.loadUsers();

      return;
    }

    void admin.refresh();
  }

  return (
    <Page>
      <PageHeader
        heading="Control Panel"
        description={`Signed in as ${user.name}. Actions here queue real work against the live catalogue and spend the API budgets shown below.`}
      />

      <aside className={styles.projection}>
        <UsherMark face="thinking" crop="head" className={styles.projectionMark} />
        <Text family="serif" tone="muted" className={styles.projectionLine}>
          <strong>The projection box.</strong> He does the reels, the sweeps and the long nights of
          re-hydrating{" "}
          {overview ? `${(overview.catalogue.titles ?? 0).toLocaleString()} records` : "the lot"}. I
          do the door. We have not spoken since 1988.
        </Text>
      </aside>

      {admin.error && <Callout>{admin.error}</Callout>}
      <p
        className={classNames(styles.message, admin.message && styles.messageVisible)}
        aria-live="polite"
      >
        {admin.message}
      </p>

      <TabList
        label="Admin sections"
        idPrefix="admin"
        selected={tab}
        tabs={TABS.map((entry) => ({ id: entry.id, label: entry.label }))}
        onSelect={(next) => selectTab(next as AdminTab)}
        actions={
          READS_DATA.has(tab) ? (
            <button type="button" className={adminStyles.refresh} onClick={refreshTab}>
              Refresh
              {overview && tab === "overview" && <em>read {formatTime(overview.fetchedAt, {})}</em>}
            </button>
          ) : undefined
        }
      />

      {tab === "overview" && <OverviewTab overview={overview} loading={admin.loading} />}

      {tab === "actions" && (
        <ActionsTab pending={admin.pending} onRun={(action) => void admin.run(action)} />
      )}

      {tab === "rooms" && <RoomsTab />}

      {tab === "pipeline" && <PipelineTab overview={overview} revision={pipelineRevision} />}

      {tab === "sources" && (
        <SourcesTab
          overview={overview}
          revision={sourcesRevision}
          onResume={(source) => void admin.resume(source)}
        />
      )}

      {tab === "listings" && <ListingsTab overview={overview} revision={listingsRevision} />}

      {tab === "quality" && <QualityTab revision={qualityRevision} />}

      {tab === "vault" && (
        <ErrorBoundary label="The vault">
          <RevivalReview revision={vaultRevision} />
        </ErrorBoundary>
      )}

      {tab === "people" && (
        <PeopleTab
          users={admin.users}
          onChangeRole={(userId, role) => void admin.changeRole(userId, role)}
        />
      )}

      {overview && (
        <p className={adminStyles.note}>
          Read at {formatTime(overview.fetchedAt, {})} ·{" "}
          <button
            type="button"
            className={adminStyles.inlineLink}
            onClick={() => void admin.refresh()}
          >
            Refresh
          </button>
        </p>
      )}
    </Page>
  );
}

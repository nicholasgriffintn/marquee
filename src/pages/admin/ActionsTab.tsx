import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminAction } from "../../hooks/useAdmin";
import { Button, Panel, TabPanel } from "../../ui";
import { ACTION_GROUPS } from "./config";

import styles from "./admin.module.css";

export function ActionsTab({
  pending,
  onRun,
}: {
  pending: string;
  onRun: (action: AdminAction) => void;
}) {
  return (
    <ErrorBoundary label="The controls">
      <TabPanel id="actions" idPrefix="admin">
        {ACTION_GROUPS.map((group) => (
          <Panel heading={group.title} key={group.title} rule="none">
            <p className={styles.note}>{group.note}</p>
            <div className={styles.actions}>
              {group.actions.map((action) => (
                <Button
                  key={action.id}
                  variant="primary"
                  size="md"
                  disabled={Boolean(pending)}
                  onClick={() => onRun(action.id)}
                >
                  {pending === action.id ? "Starting…" : action.label}
                </Button>
              ))}
            </div>
          </Panel>
        ))}
      </TabPanel>
    </ErrorBoundary>
  );
}

import { ErrorBoundary } from "../../components/ErrorBoundary";
import type { AdminAction } from "../../hooks/useAdmin";
import { ACTION_GROUPS } from "./config";

export function ActionsTab({
  pending,
  onRun,
}: {
  pending: string;
  onRun: (action: AdminAction) => void;
}) {
  return (
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
                  disabled={Boolean(pending)}
                  onClick={() => onRun(action.id)}
                >
                  {pending === action.id ? "Starting…" : action.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ErrorBoundary>
  );
}

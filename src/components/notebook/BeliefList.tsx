import { useState } from "react";

import {
  beliefGroup,
  confidenceLabel,
  GROUP_TITLES,
  isSuspended,
  strengthLabel,
  type Belief,
} from "../../domain/notebook";

function suspendLabel(belief: Belief) {
  if (!belief.suspendedUntil) {
    return "";
  }

  const days = Math.round((Date.parse(belief.suspendedUntil) - Date.now()) / 86_400_000);

  if (days > 60) {
    return "Torn out for now";
  }

  return days >= 1 ? `Set aside for ${days} day${days === 1 ? "" : "s"}` : "Set aside for tonight";
}

export function BeliefList({
  beliefs,
  busy,
  onAct,
}: {
  beliefs: Belief[];
  busy: string;
  onAct: (belief: Belief, body: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const grouped = new Map<string, Belief[]>();

  for (const belief of beliefs) {
    const group = beliefGroup(belief.key.replace(/^rule:/u, ""));

    grouped.set(group, [...(grouped.get(group) ?? []), belief]);
  }

  if (beliefs.length === 0) {
    return (
      <p className="notebook-empty">
        The page is blank. Watch a few things, rate them honestly, and it will fill itself in.
      </p>
    );
  }

  return (
    <>
      {[...grouped.entries()].map(([group, items]) => (
        <div className="notebook-shelf" key={group}>
          <h3>{GROUP_TITLES[group] ?? "Other observations"}</h3>
          <ul className="notebook-list">
            {items.map((belief) => {
              const suspended = isSuspended(belief);

              return (
                <li
                  key={belief.id}
                  className={`notebook-note${suspended ? " suspended" : ""}${
                    busy === belief.id ? " busy" : ""
                  }`}
                >
                  {editing?.id === belief.id ? (
                    <form
                      className="notebook-edit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onAct(belief, { action: "rewrite", value: editing.value });
                        setEditing(null);
                      }}
                    >
                      <input
                        value={editing.value}
                        maxLength={160}
                        aria-label="Rewrite this note"
                        onChange={(event) =>
                          setEditing({ id: belief.id, value: event.target.value })
                        }
                      />
                      <button type="submit" className="notebook-primary">
                        Put that down instead
                      </button>
                      <button type="button" onClick={() => setEditing(null)}>
                        Leave it
                      </button>
                    </form>
                  ) : (
                    <>
                      <p className="notebook-value">{belief.value}</p>
                      <p className="notebook-meta">
                        <span>{confidenceLabel(belief.confidence)}</span>
                        <em>{strengthLabel(belief.strength)}</em>
                        {belief.evidence > 0 && (
                          <small>
                            {belief.evidence} thing{belief.evidence === 1 ? "" : "s"} on your shelf
                          </small>
                        )}
                        {belief.edited && <small>in your words</small>}
                        {suspended && <strong>{suspendLabel(belief)}</strong>}
                      </p>
                      <div className="notebook-actions">
                        {suspended ? (
                          <button
                            type="button"
                            disabled={busy === belief.id}
                            onClick={() => onAct(belief, { action: "restore" })}
                          >
                            {busy === belief.id ? "Putting it back…" : "Put it back"}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy === belief.id}
                              onClick={() => setEditing({ id: belief.id, value: belief.value })}
                            >
                              Rewrite
                            </button>
                            <button
                              type="button"
                              disabled={busy === belief.id}
                              onClick={() => onAct(belief, { action: "suspend", scope: "tonight" })}
                            >
                              {busy === belief.id ? "Setting aside…" : "Not tonight"}
                            </button>
                            <button
                              type="button"
                              disabled={busy === belief.id}
                              onClick={() => onAct(belief, { action: "suspend", scope: "week" })}
                            >
                              {busy === belief.id ? "Setting aside…" : "Not this week"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="notebook-forget"
                          disabled={busy === belief.id}
                          onClick={() => onAct(belief, { action: "forget" })}
                        >
                          {busy === belief.id ? "Forgetting…" : "Forget it"}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

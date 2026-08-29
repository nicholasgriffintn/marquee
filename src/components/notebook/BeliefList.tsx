import { useState } from "react";

import {
  beliefGroup,
  confidenceLabel,
  GROUP_TITLES,
  isSuspended,
  NOTE_FACET_RULE,
  strengthLabel,
  type Belief,
} from "../../domain/notebook";
import { classNames } from "../../lib/class-names";
import { Button, Text } from "../../ui";
import { BeliefEvidence } from "./BeliefEvidence";
import { NotebookEmpty, NotebookSubheading } from "./NotebookSection";

import styles from "./BeliefList.module.css";

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
      <NotebookEmpty>
        The page is blank. Watch a few things, rate them honestly, and it will fill itself in.
      </NotebookEmpty>
    );
  }

  return (
    <>
      {[...grouped.entries()].map(([group, items]) => (
        <div className={styles.shelf} key={group}>
          <NotebookSubheading>{GROUP_TITLES[group] ?? "Other observations"}</NotebookSubheading>
          <ul className={styles.list}>
            {items.map((belief) => {
              const suspended = isSuspended(belief);
              const fromNotes = belief.sourceRule === NOTE_FACET_RULE;

              return (
                <li
                  key={belief.id}
                  className={classNames(
                    styles.note,
                    suspended && styles.suspended,
                    busy === belief.id && styles.busy,
                  )}
                >
                  {editing?.id === belief.id ? (
                    <form
                      className={styles.edit}
                      onSubmit={(event) => {
                        event.preventDefault();
                        onAct(belief, { action: "rewrite", value: editing.value });
                        setEditing(null);
                      }}
                    >
                      <input
                        className={styles.editInput}
                        value={editing.value}
                        maxLength={160}
                        aria-label="Rewrite this note"
                        onChange={(event) =>
                          setEditing({ id: belief.id, value: event.target.value })
                        }
                      />
                      <Button variant="primary" size="sm" type="submit" className={styles.editSave}>
                        Put that down instead
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                        Leave it
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Text family="serif" className={styles.value}>
                        {belief.value}
                      </Text>
                      <p className={styles.meta}>
                        <span>{confidenceLabel(belief.confidence)}</span>
                        <em>{strengthLabel(belief.strength)}</em>
                        {belief.evidence > 0 && (
                          <small>
                            {belief.evidence}{" "}
                            {fromNotes
                              ? `of your own note${belief.evidence === 1 ? "" : "s"}`
                              : `thing${belief.evidence === 1 ? "" : "s"} on your shelf`}
                          </small>
                        )}
                        {belief.edited && <small>in your words</small>}
                        {suspended && <strong>{suspendLabel(belief)}</strong>}
                      </p>
                      {fromNotes && <BeliefEvidence belief={belief} />}
                      <div className={styles.actions}>
                        {suspended ? (
                          <button
                            type="button"
                            className={styles.action}
                            disabled={busy === belief.id}
                            onClick={() => onAct(belief, { action: "restore" })}
                          >
                            {busy === belief.id ? "Putting it back…" : "Put it back"}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={styles.action}
                              disabled={busy === belief.id}
                              onClick={() => setEditing({ id: belief.id, value: belief.value })}
                            >
                              Rewrite
                            </button>
                            <button
                              type="button"
                              className={styles.action}
                              disabled={busy === belief.id}
                              onClick={() => onAct(belief, { action: "suspend", scope: "tonight" })}
                            >
                              {busy === belief.id ? "Setting aside…" : "Not tonight"}
                            </button>
                            <button
                              type="button"
                              className={styles.action}
                              disabled={busy === belief.id}
                              onClick={() => onAct(belief, { action: "suspend", scope: "week" })}
                            >
                              {busy === belief.id ? "Setting aside…" : "Not this week"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className={classNames(styles.action, styles.forget)}
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

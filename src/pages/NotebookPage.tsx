import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { UsherMark } from "../components/usher/UsherMark";
import {
  beliefGroup,
  confidenceLabel,
  GROUP_TITLES,
  isSuspended,
  strengthLabel,
  type Belief,
  type Guest,
} from "../domain/notebook";
import { jsonRequest, requestJson } from "../lib/api";

type NotebookResponse = { beliefs: Belief[] };

type GuestResponse = { guests: Guest[] };

function suspendLabel(belief: Belief) {
  if (!belief.suspendedUntil) {
    return "";
  }

  const until = new Date(belief.suspendedUntil);
  const days = Math.round((until.getTime() - Date.now()) / 86_400_000);

  if (days > 60) {
    return "Set aside";
  }

  return days >= 1 ? `Set aside for ${days} day${days === 1 ? "" : "s"}` : "Set aside for tonight";
}

export function NotebookPage({ isSignedIn }: { isSignedIn: boolean }) {
  const [beliefs, setBeliefs] = useState<Belief[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [reloads, setReloads] = useState(0);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [draft, setDraft] = useState({ name: "", vetoes: "" });

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<NotebookResponse>("/api/notebook", {
          signal: controller.signal,
        });

        setBeliefs(response.beliefs);
        setError("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setBeliefs([]);
        setError("The notebook is out of reach for a moment. Try again shortly.");
      }
    }

    void load();
    void requestJson<GuestResponse>("/api/notebook/guests", { signal: controller.signal })
      .then((response) => setGuests(response.guests))
      .catch(() => undefined);

    return () => controller.abort();
  }, [isSignedIn, reloads]);

  async function saveGuest() {
    const name = draft.name.trim();

    if (!name) {
      return;
    }

    try {
      const response = await requestJson<GuestResponse>(
        "/api/notebook/guests",
        jsonRequest("POST", {
          name,
          vetoes: draft.vetoes
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }),
      );

      setGuests(response.guests);
      setDraft({ name: "", vetoes: "" });
    } catch {
      setError("Could not note them down.");
    }
  }

  async function dropGuest(guest: Guest) {
    try {
      const response = await requestJson<GuestResponse>(
        `/api/notebook/guests/${guest.id}`,
        jsonRequest("DELETE"),
      );

      setGuests(response.guests);
    } catch {
      setError("Could not show them out.");
    }
  }

  async function act(belief: Belief, body: Record<string, unknown>) {
    setBusy(belief.id);

    try {
      await requestJson(`/api/notebook/${belief.id}`, jsonRequest("PATCH", body));
      setEditing(null);
      setReloads((count) => count + 1);
    } catch {
      setError("That did not take. Try again.");
    } finally {
      setBusy("");
    }
  }

  const notes = isSignedIn ? beliefs : [];
  const grouped = new Map<string, Belief[]>();

  for (const belief of notes ?? []) {
    const group = beliefGroup(belief.key.replace(/^rule:/u, ""));

    grouped.set(group, [...(grouped.get(group) ?? []), belief]);
  }

  return (
    <section className="page-section notebook">
      <div className="notebook-head">
        <UsherMark face="thinking" crop="head" className="notebook-mark" />
        <div>
          <p className="page-eyebrow">The Usher's notebook</p>
          <h1>What I have written down about you.</h1>
          <p className="notebook-lede">
            Nothing in here is a secret. Correct it, set it aside for a night, or tear the page out
            entirely. I will not take it personally.
          </p>
        </div>
      </div>

      {error && (
        <p className="notebook-error" role="alert">
          {error}
        </p>
      )}

      {!isSignedIn ? (
        <p className="notebook-empty">
          I only keep notes on people with a ticket.{" "}
          <Link to="/sign-in?returnTo=%2Fnotebook">Come to the box office</Link> and I will start
          one.
        </p>
      ) : notes === null ? (
        <p className="notebook-empty">Finding my glasses…</p>
      ) : notes.length === 0 ? (
        <p className="notebook-empty">
          The page is blank. Watch a few things, rate them honestly, and it will fill itself in.
        </p>
      ) : (
        [...grouped.entries()].map(([group, items]) => (
          <div className="notebook-group" key={group}>
            <h2>{GROUP_TITLES[group] ?? "Other observations"}</h2>
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
                          void act(belief, { action: "rewrite", value: editing.value });
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
                              {belief.evidence} thing{belief.evidence === 1 ? "" : "s"} on your
                              shelf
                            </small>
                          )}
                          {belief.edited && <small>in your words</small>}
                          {suspended && <strong>{suspendLabel(belief)}</strong>}
                        </p>
                        <div className="notebook-actions">
                          {suspended ? (
                            <button
                              type="button"
                              onClick={() => void act(belief, { action: "restore" })}
                            >
                              Put it back
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditing({ id: belief.id, value: belief.value })}
                              >
                                Rewrite
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void act(belief, { action: "suspend", scope: "tonight" })
                                }
                              >
                                Not tonight
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void act(belief, { action: "suspend", scope: "week" })
                                }
                              >
                                Not this week
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="notebook-forget"
                            onClick={() => void act(belief, { action: "forget" })}
                          >
                            Forget it
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      {isSignedIn && (
        <div className="notebook-group notebook-guests">
          <h2>Who else sits with you</h2>
          <p className="notebook-lede">
            Give me a name and what they will not sit through, and I will keep it in mind when you
            tell me the room is not just you.
          </p>

          {guests.length > 0 && (
            <ul className="notebook-guest-list">
              {guests.map((guest) => (
                <li key={guest.id}>
                  <strong>{guest.name}</strong>
                  <small>
                    {guest.vetoes.length ? `No ${guest.vetoes.join(", ")}` : "No hard vetoes"}
                  </small>
                  <button type="button" onClick={() => void dropGuest(guest)}>
                    Show them out
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="notebook-guest-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveGuest();
            }}
          >
            <input
              value={draft.name}
              maxLength={40}
              placeholder="Name"
              aria-label="Their name"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <input
              value={draft.vetoes}
              maxLength={120}
              placeholder="Will not sit through… (horror, musicals)"
              aria-label="What they will not sit through"
              onChange={(event) => setDraft({ ...draft, vetoes: event.target.value })}
            />
            <button type="submit" className="notebook-primary" disabled={!draft.name.trim()}>
              Save them a seat
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

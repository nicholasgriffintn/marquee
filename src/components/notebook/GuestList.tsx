import { useState } from "react";

import type { Guest } from "../../domain/notebook";

export function GuestList({
  guests,
  onSave,
  onRemove,
}: {
  guests: Guest[];
  onSave: (name: string, vetoes: string[]) => void;
  onRemove: (guest: Guest) => void;
}) {
  const [draft, setDraft] = useState({ name: "", vetoes: "" });

  return (
    <>
      {guests.length > 0 && (
        <ul className="notebook-guest-list">
          {guests.map((guest) => (
            <li key={guest.id}>
              <strong>{guest.name}</strong>
              <small>
                {guest.vetoes.length ? `No ${guest.vetoes.join(", ")}` : "No hard vetoes"}
              </small>
              <button type="button" onClick={() => onRemove(guest)}>
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
          onSave(
            draft.name.trim(),
            draft.vetoes
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          );
          setDraft({ name: "", vetoes: "" });
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
    </>
  );
}

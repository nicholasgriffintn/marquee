import { useState } from "react";

import type { Guest } from "../../domain/notebook";
import { Button } from "../../ui";

import styles from "./GuestList.module.css";

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
        <ul className={styles.guests}>
          {guests.map((guest) => (
            <li key={guest.id}>
              <strong>{guest.name}</strong>
              <small>
                {guest.vetoes.length ? `No ${guest.vetoes.join(", ")}` : "No hard vetoes"}
              </small>
              <button type="button" className={styles.remove} onClick={() => onRemove(guest)}>
                Show them out
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className={styles.form}
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
          className={styles.name}
          value={draft.name}
          maxLength={40}
          placeholder="Name"
          aria-label="Their name"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          className={styles.vetoes}
          value={draft.vetoes}
          maxLength={120}
          placeholder="Will not sit through… (horror, musicals)"
          aria-label="What they will not sit through"
          onChange={(event) => setDraft({ ...draft, vetoes: event.target.value })}
        />
        <Button
          variant="primary"
          size="lg"
          type="submit"
          className={styles.submit}
          disabled={!draft.name.trim()}
        >
          Save them a seat
        </Button>
      </form>
    </>
  );
}

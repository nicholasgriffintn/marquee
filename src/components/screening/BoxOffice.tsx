import { useId, useState } from "react";

import { avatarById } from "../../domain/avatars";
import type { MediaTitle } from "../../domain/catalog";
import { isFacadeId } from "../../domain/facades";
import { findTool } from "../../domain/screening";
import type { ScreeningRoom } from "../../hooks/useScreening";
import { Button, Modal, StatusNote, TextInput } from "../../ui";
import { GeneratedAvatar } from "../GeneratedAvatar";
import { CinemaFacade } from "../tour/facades/CinemaFacade";

import styles from "./BoxOffice.module.css";

const HEADING_ID = "box-office-heading";

export function BoxOffice({
  screening,
  showing,
  isSignedIn,
  onPick,
  onDone,
}: {
  screening: ScreeningRoom;
  showing: MediaTitle[];
  isSignedIn: boolean;
  onPick: () => void;
  onDone: () => void;
}) {
  const { room, you, isHost, error, actions } = screening;
  const [isJoining, setIsJoining] = useState(false);
  const [first, setFirst] = useState("");
  const nameId = useId();
  const ballot = room ? findTool(room.definition, "ballot") : null;
  const avatar = you ? avatarById(you.avatar) : null;
  const cinema = ballot?.options.find((option) => option.id === you?.choice);

  async function pick(optionId: string) {
    onPick();
    setIsJoining(true);
    await actions.join(optionId, first.trim());
    setIsJoining(false);
  }

  return (
    <Modal onClose={onDone} labelledBy={HEADING_ID} className={styles.shell}>
      <article className={styles.checkIn}>
        {you && avatar ? (
          <>
            <header className={styles.head}>
              <p className={styles.from}>
                <span>Ticket</span>
                <em>{cinema?.label ?? you.choice}</em>
              </p>
              <h2 className={styles.heading} id={HEADING_ID}>
                {isHost ? "You have the torch." : `Tonight you are ${avatar.name}.`}
              </h2>
            </header>

            <div className={styles.reveal}>
              <span className={styles.big}>
                <GeneratedAvatar avatar={avatar} size={168} />
              </span>
              <div className={styles.revealCopy}>
                <strong>{avatar.name}</strong>
                <small>of {cinema?.label ?? "the house"}</small>
                <p>
                  {isHost
                    ? "Everyone on the link sees where you are. Walk the building and they follow."
                    : "Your cursor walks with you. The room sees where you point, what you search and which doors you knock on."}
                </p>
              </div>
            </div>

            <footer className={styles.foot}>
              <Button variant="primary" size="lg" surface="paper" onClick={onDone}>
                Into the building
              </Button>
            </footer>
          </>
        ) : (
          <>
            <header className={styles.head}>
              <p className={styles.from}>
                <span>Box office</span>
                <em>{room?.definition.title ?? "The tour"}</em>
              </p>
              <h2 className={styles.heading} id={HEADING_ID}>
                {ballot?.question ?? "Which cinema are you buying a ticket for?"}
              </h2>
              <p className={styles.standfirst}>
                Your cinema decides who you are in the room. Same live board on every one of them.
              </p>
            </header>

            {!isSignedIn && room?.status !== "closed" && (
              <label className={styles.name} htmlFor={nameId}>
                <span>Your first name, if you like</span>
                <TextInput
                  id={nameId}
                  surface="paper"
                  size="md"
                  value={first}
                  maxLength={24}
                  placeholder="Goes on your ticket next to your part"
                  onChange={(event) => setFirst(event.target.value)}
                />
              </label>
            )}

            {room?.status === "closed" ? (
              <StatusNote tone="warning" surface="paper" role="alert">
                The doors are shut. Nobody else is being let in tonight.
              </StatusNote>
            ) : (
              <ol className={styles.cinemas}>
                {(ballot?.options ?? []).map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={styles.cinema}
                      disabled={isJoining || !room}
                      onClick={() => void pick(option.id)}
                    >
                      <span className={styles.preview}>
                        {isFacadeId(option.id) && <CinemaFacade id={option.id} showing={showing} />}
                      </span>
                      <span className={styles.copy}>
                        <strong>{option.label}</strong>
                        <small>{option.blurb}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {error && (
              <StatusNote tone="warning" surface="paper" role="alert">
                {error}
              </StatusNote>
            )}

            {!room && !error && (
              <StatusNote busy surface="paper" live="polite">
                Finding the room.
              </StatusNote>
            )}
          </>
        )}
      </article>
    </Modal>
  );
}

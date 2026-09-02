import { useEffect, useRef, useState, type FormEvent } from "react";

import { avatarById } from "../../domain/avatars";
import {
  type FeedEntry,
  findTool,
  type Member,
  memberTally,
  screeningUrl,
  stageOf,
} from "../../domain/screening";
import type { ScreeningRoom } from "../../hooks/useScreening";
import { classNames } from "../../lib/class-names";
import { copyText } from "../../lib/clipboard";
import { UsherMark } from "../usher/UsherMark";
import { Avatar } from "./Avatar";
import { GameCard, SteerCard } from "./RoomGames";
import { PollCard } from "./RoomPoll";

import styles from "./ScreeningPanel.module.css";

const CONNECTION_LABEL = {
  idle: "Not connected",
  connecting: "Connecting",
  live: "Live",
  offline: "Reconnecting",
} as const;

function MemberChip({ member, isYou }: { member: Member; isYou: boolean }) {
  const avatar = avatarById(member.avatar);

  return (
    <li
      className={classNames(
        styles.member,
        !member.online && styles.away,
        member.role === "host" && styles.hostMember,
      )}
      title={`${member.name}${isYou ? " (you)" : ""}${member.online ? "" : ", stepped out"}`}
    >
      {avatar ? <Avatar avatar={avatar} size={30} decorative /> : <i />}
    </li>
  );
}

function Entry({ entry, members }: { entry: FeedEntry; members: Map<string, Member> }) {
  const member = entry.member ? members.get(entry.member) : null;
  const avatar = member ? avatarById(member.avatar) : null;

  if (entry.kind === "usher") {
    return (
      <li className={styles.usherEntry}>
        <span className={styles.usherMark}>
          <UsherMark face="thinking" crop="head" />
        </span>
        <div className={styles.usherSaid}>
          <strong>The Usher</strong>
          <p>{entry.text}</p>
        </div>
      </li>
    );
  }

  if (entry.kind === "note") {
    return <li className={styles.note}>{entry.text}</li>;
  }

  return (
    <li className={classNames(styles.entry, entry.kind !== "say" && styles.event)}>
      <span className={styles.entryAvatar}>
        {avatar ? <Avatar avatar={avatar} size={22} decorative /> : null}
      </span>
      <p>
        <strong>{member?.name ?? "Someone"}</strong>
        {entry.kind === "say" ? (
          <span>{entry.text}</span>
        ) : entry.kind === "act" ? (
          <span>
            {entry.verb ? `${entry.verb} ` : ""}
            <q>{entry.text}</q>
          </span>
        ) : (
          <span>{entry.text}</span>
        )}
      </p>
    </li>
  );
}

export function ScreeningPanel({
  screening,
  follow,
  onFollow,
  isPresenting,
  isAdmin = false,
  layout = "side",
}: {
  screening: ScreeningRoom;
  follow: boolean;
  onFollow: (follow: boolean) => void;
  isPresenting: boolean;
  isAdmin?: boolean;
  layout?: "side" | "page";
}) {
  const { room, you, isHost, connection, error, actions } = screening;
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const feedRef = useRef<HTMLOListElement>(null);
  const feed = room?.feed;

  useEffect(() => {
    if (feed && feedRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight });
    }
  }, [feed]);

  if (!room || !you) {
    return null;
  }

  const definition = room.definition;
  const members = new Map(room.members.map((member) => [member.key, member]));
  const online = room.members.filter((member) => member.online).length;
  const hostStage = stageOf(definition, room.hostStage);
  const ballot = findTool(definition, "ballot");
  const usher = findTool(definition, "usher");
  const games = findTool(definition, "games");
  const steerTool = findTool(definition, "steer");
  const reactions = findTool(definition, "reactions");
  const pollsTool = findTool(definition, "polls");
  const openPoll = room.polls.find((poll) => poll.status === "open") ?? null;
  const latestPoll = room.polls[0] ?? null;
  const running =
    Boolean(room.game && room.game.phase !== "over") || Boolean(room.steer) || Boolean(openPoll);
  const hasStages = definition.stages.length > 0;
  const tally = memberTally(definition, room.members);
  const isOpen = room.status === "open";
  const canSpeak = isOpen && connection === "live";
  const link = screeningUrl(window.location.origin, room.id, definition);

  function verbFor(entry: FeedEntry) {
    const stage = stageOf(definition, entry.stage ?? null);

    return entry.verb ? (stage?.actions?.[entry.verb] ?? entry.verb) : "";
  }

  function submit(event: FormEvent) {
    event.preventDefault();

    const text = draft.trim();

    if (!text || !canSpeak) {
      return;
    }

    actions.say(text);
    setDraft("");
  }

  async function copy() {
    setCopied(await copyText(link));
  }

  return (
    <aside
      className={classNames(
        styles.panel,
        isPresenting && styles.presenting,
        layout === "page" && styles.page,
        collapsed && styles.collapsed,
      )}
      aria-label="The screening"
    >
      <header className={styles.head}>
        <p className={styles.eyebrow}>
          <span className={classNames(styles.lamp, connection === "live" && styles.lit)} />
          Screening · {CONNECTION_LABEL[connection]}
        </p>
        <h2 className={styles.title}>{definition.title}</h2>
        <p className={styles.doors}>
          {isOpen ? "Doors open" : "Doors shut"} · {online} in the room
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setCollapsed((current) => !current)}
            aria-expanded={!collapsed}
          >
            {collapsed ? "Show the room" : "Tuck away"}
          </button>
        </p>

        <div className={styles.controls}>
          {isHost ? (
            <>
              <button type="button" className={styles.control} onClick={() => void copy()}>
                {copied ? "Link copied" : "Copy the link"}
              </button>
              <button
                type="button"
                className={classNames(styles.control, isOpen && styles.danger)}
                onClick={() => void actions.setStatus(isOpen ? "closed" : "open")}
              >
                {isOpen ? "Shut the doors" : "Open the doors"}
              </button>
            </>
          ) : (
            isAdmin && (
              <button
                type="button"
                className={styles.control}
                onClick={() => void actions.takeTorch()}
              >
                Take the torch
              </button>
            )
          )}
        </div>

        {!isHost && hasStages && (
          <button
            type="button"
            className={classNames(styles.torch, follow && styles.following)}
            aria-pressed={follow}
            aria-label={follow ? "Following the torch. Stop following." : "Follow the torch"}
            title={follow ? "Following the torch" : "Follow the torch"}
            onClick={() => onFollow(!follow)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9h9l7-4v14l-7-4H4z" />
              <path d="M4 9v6" />
              <path d="M13 9v6" />
            </svg>
          </button>
        )}
      </header>

      <ul className={styles.members} aria-label="In the room">
        {room.members.map((member) => (
          <MemberChip key={member.key} member={member} isYou={member.key === you.key} />
        ))}
      </ul>

      {room.game ? (
        <GameCard game={room.game} seconds={games?.seconds ?? 15} screening={screening} />
      ) : room.steer ? (
        <SteerCard steer={room.steer} seconds={steerTool?.seconds ?? 12} screening={screening} />
      ) : openPoll ? (
        <PollCard poll={openPoll} screening={screening} />
      ) : (
        <section className={styles.stage} aria-labelledby="screening-stage">
          {hasStages ? (
            <p className={styles.stageHead} id="screening-stage">
              <span>{isHost ? "You have the torch" : "The usher is at"}</span>
              <strong>{hostStage?.name ?? "The step"}</strong>
            </p>
          ) : (
            <p className={styles.stageHead} id="screening-stage">
              <span>{isHost ? "You have the torch" : "Waiting on the host"}</span>
              <strong>{latestPoll ? "Last poll closed" : "No poll yet"}</strong>
            </p>
          )}
          {hostStage && <blockquote className={styles.prompt}>{hostStage.prompt}</blockquote>}
          {!hasStages && latestPoll && <PollCard poll={latestPoll} screening={screening} />}
          {isHost && isOpen && !running && (games || steerTool || pollsTool) && (
            <div className={styles.tools}>
              {games && (
                <button type="button" onClick={actions.startGame}>
                  Quickfire
                </button>
              )}
              {steerTool && (
                <button type="button" onClick={actions.startSteer}>
                  Steer the corridor
                </button>
              )}
              {pollsTool && (
                <button type="button" onClick={actions.startPoll}>
                  Open a poll
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {ballot && (
        <section className={styles.house} aria-label="The house">
          <ol>
            {ballot.options.map((option) => {
              const count = tally[option.id] ?? 0;
              const share = room.members.length > 0 ? (count / room.members.length) * 100 : 0;

              return (
                <li
                  key={option.id}
                  className={classNames(you.choice === option.id && styles.yours)}
                >
                  <span>{option.label}</span>
                  <i aria-hidden="true">
                    <b style={{ width: `${share}%` }} />
                  </i>
                  <em>{count}</em>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <ol className={styles.feed} ref={feedRef} aria-live="polite" aria-label="The room">
        {room.feed.map((entry) => (
          <Entry
            key={entry.id}
            entry={entry.kind === "act" ? { ...entry, verb: verbFor(entry) } : entry}
            members={members}
          />
        ))}
      </ol>

      {error && (
        <p className={styles.error} role="alert">
          {error}
          <button type="button" onClick={actions.dismissError} aria-label="Dismiss">
            ×
          </button>
        </p>
      )}

      <form className={styles.composer} onSubmit={submit}>
        {reactions && (
          <span className={styles.reactions}>
            {reactions.emoji.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.reaction}
                disabled={connection !== "live"}
                onClick={() => actions.react(emoji)}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </span>
        )}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            canSpeak
              ? usher
                ? `Say something, or @${usher.trigger.handle} to ask him`
                : "Say something"
              : isOpen
                ? "Waiting for the room"
                : "The doors are shut"
          }
          disabled={!canSpeak}
          maxLength={400}
          aria-label="Message the room"
        />
        <button type="submit" className={styles.send} disabled={!canSpeak || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}

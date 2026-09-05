import { useEffect, useState } from "react";

import { avatarById } from "../../domain/avatars";
import type { GameState, Member, SteerState } from "../../domain/screening";
import type { ScreeningRoom } from "../../hooks/useScreening";
import { classNames } from "../../lib/class-names";
import { GeneratedAvatar } from "../GeneratedAvatar";
import { TitleArt } from "../TitleArt";

import styles from "./RoomGames.module.css";

const REVEAL_MS = 5_000;
const LEADERS = 5;

function useRemaining(endsAt: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt <= Date.now()) {
      return undefined;
    }

    const timer = setInterval(() => setNow(Date.now()), 200);

    return () => clearInterval(timer);
  }, [endsAt]);

  return Math.max(0, endsAt - now);
}

function TimerBar({ endsAt, duration }: { endsAt: number; duration: number }) {
  const remaining = useRemaining(endsAt);
  const share = duration > 0 ? Math.min(100, (remaining / duration) * 100) : 0;

  return (
    <span className={styles.timer} aria-hidden="true">
      <i style={{ width: `${share}%` }} />
    </span>
  );
}

function Leaderboard({
  scores,
  members,
  you,
}: {
  scores: Record<string, number>;
  members: Map<string, Member>;
  you: string;
}) {
  const standings = Object.entries(scores)
    .toSorted(([, left], [, right]) => right - left)
    .slice(0, LEADERS);

  if (standings.length === 0) {
    return <p className={styles.empty}>Nobody scored. The building keeps its secrets.</p>;
  }

  return (
    <ol className={styles.board}>
      {standings.map(([key, score], index) => {
        const member = members.get(key);
        const avatar = member ? avatarById(member.avatar) : null;

        return (
          <li key={key} className={classNames(key === you && styles.you)}>
            <i>{index + 1}</i>
            {avatar && <GeneratedAvatar avatar={avatar} size={22} decorative />}
            <span>{member?.name ?? "Someone"}</span>
            <em>{score}</em>
          </li>
        );
      })}
    </ol>
  );
}

export function GameCard({
  game,
  seconds,
  screening,
}: {
  game: GameState;
  seconds: number;
  screening: ScreeningRoom;
}) {
  const { room, isHost, answer, actions } = screening;
  const members = new Map((room?.members ?? []).map((member) => [member.key, member]));
  const context = `${game.id}:${game.round}`;
  const chosen = answer?.context === context ? answer.optionId : null;
  const question = game.question;
  const yourScore = room ? (game.scores[room.you] ?? 0) : 0;

  return (
    <section className={styles.card} aria-label="The quickfire">
      <header className={styles.head}>
        <p>
          <span>Quickfire</span>
          <strong>
            {game.phase === "over" ? "Final standings" : `Round ${game.round} of ${game.of}`}
          </strong>
        </p>
        {isHost && (
          <button type="button" className={styles.stop} onClick={actions.stopGame}>
            {game.phase === "over" ? "Clear" : "Stop"}
          </button>
        )}
      </header>

      {game.phase !== "over" && (
        <TimerBar
          endsAt={game.endsAt}
          duration={game.phase === "question" ? seconds * 1_000 : REVEAL_MS}
        />
      )}

      {game.phase === "over" ? (
        <>
          <Leaderboard scores={game.scores} members={members} you={room?.you ?? ""} />
          <p className={styles.yours}>You finished on {yourScore}.</p>
        </>
      ) : (
        question && (
          <>
            <div className={styles.question}>
              {question.posterUrl && (
                <span className={styles.poster}>
                  <TitleArt url={question.posterUrl} seed={context} label="" width={120} />
                </span>
              )}
              <p
                className={classNames(styles.prompt, question.kind === "describe" && styles.quote)}
              >
                {question.prompt}
              </p>
            </div>

            <ol
              className={classNames(
                styles.options,
                question.options.some((option) => option.posterUrl) && styles.withArt,
              )}
            >
              {question.options.map((option) => {
                const isCorrect = game.correct === option.id;
                const isChosen = chosen === option.id;
                const revealed = game.phase === "reveal";

                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={classNames(
                        styles.option,
                        isChosen && styles.chosen,
                        revealed && isCorrect && styles.correct,
                        revealed && isChosen && !isCorrect && styles.wrong,
                      )}
                      disabled={revealed || chosen !== null}
                      aria-pressed={isChosen}
                      onClick={() => actions.answer(context, option.id)}
                    >
                      {option.posterUrl && (
                        <span className={styles.optionArt}>
                          <TitleArt url={option.posterUrl} seed={option.id} label="" width={120} />
                        </span>
                      )}
                      <span className={styles.optionLabel}>{option.label}</span>
                      {revealed && <em>{game.counts[option.id] ?? 0}</em>}
                    </button>
                  </li>
                );
              })}
            </ol>

            <p className={styles.yours}>
              {game.phase === "reveal"
                ? chosen === null
                  ? "You sat that one out."
                  : chosen === game.correct
                    ? "Right. Points on the board."
                    : "Wrong, but confidently."
                : chosen
                  ? "Answer in. Waiting on the room."
                  : "Pick one before the bar runs out."}{" "}
              <span>{yourScore} pts</span>
            </p>
          </>
        )
      )}
    </section>
  );
}

export function SteerCard({
  steer,
  seconds,
  screening,
}: {
  steer: SteerState;
  seconds: number;
  screening: ScreeningRoom;
}) {
  const { isHost, pick, actions } = screening;
  const context = `${steer.id}:${steer.phase}`;
  const chosen = pick?.context === context ? pick.optionId : null;
  const total = Object.values(steer.counts).reduce((sum, count) => sum + count, 0);

  return (
    <section className={styles.card} aria-label="Steer the corridor">
      <header className={styles.head}>
        <p>
          <span>Steer the corridor</span>
          <strong>
            {steer.phase === "from"
              ? "Where does the walk start?"
              : steer.phase === "to"
                ? "And where does it end?"
                : "The room has spoken"}
          </strong>
        </p>
        {isHost && (
          <button type="button" className={styles.stop} onClick={actions.stopSteer}>
            Stop
          </button>
        )}
      </header>

      {steer.phase !== "walk" ? (
        <>
          <TimerBar endsAt={steer.endsAt} duration={seconds * 1_000} />
          <ol className={classNames(styles.options, styles.withArt)}>
            {steer.options.map((title) => {
              const count = steer.counts[title.id] ?? 0;

              return (
                <li key={title.id}>
                  <button
                    type="button"
                    className={classNames(styles.option, chosen === title.id && styles.chosen)}
                    aria-pressed={chosen === title.id}
                    title={title.title}
                    onClick={() => actions.pick(context, title.id)}
                  >
                    <span className={styles.optionArt}>
                      <TitleArt url={title.posterUrl} seed={title.id} label="" width={120} />
                    </span>
                    <span className={styles.optionLabel}>{title.title}</span>
                    <em>{count}</em>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className={styles.yours}>
            {total === 1 ? "1 vote in." : `${total} votes in.`} You can change yours until the bar
            runs out.
          </p>
        </>
      ) : (
        <p className={styles.walk}>
          <strong>{steer.from?.title}</strong>
          <span>→</span>
          <strong>{steer.to?.title}</strong>
          <small>The corridor on the page is now walking the room's route.</small>
        </p>
      )}
    </section>
  );
}

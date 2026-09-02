import type { PollState } from "../../domain/screening";
import type { ScreeningRoom } from "../../hooks/useScreening";
import { classNames } from "../../lib/class-names";
import { TitleArt } from "../TitleArt";

import styles from "./RoomGames.module.css";

export function PollCard({ poll, screening }: { poll: PollState; screening: ScreeningRoom }) {
  const { isHost, vote, actions } = screening;
  const chosen = vote?.context === poll.id ? vote.optionId : null;
  const total = Object.values(poll.counts).reduce((sum, count) => sum + count, 0);
  const isOpen = poll.status === "open";

  return (
    <section className={styles.card} aria-label="The poll">
      <header className={styles.head}>
        <p>
          <span>The house decides</span>
          <strong>{poll.question}</strong>
        </p>
        {isHost && isOpen && (
          <button type="button" className={styles.stop} onClick={actions.closePoll}>
            Close
          </button>
        )}
      </header>

      <ol className={classNames(styles.options, styles.withArt)}>
        {poll.options.map((title) => {
          const count = poll.counts[title.id] ?? 0;
          const isWinner = poll.winner === title.id;

          return (
            <li key={title.id}>
              <button
                type="button"
                className={classNames(
                  styles.option,
                  chosen === title.id && styles.chosen,
                  isWinner && styles.correct,
                )}
                aria-pressed={chosen === title.id}
                disabled={!isOpen}
                title={title.title}
                onClick={() => actions.vote(poll.id, title.id)}
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
        {isOpen
          ? `${total === 1 ? "1 vote in" : `${total} votes in`}. Change yours until the host closes it.`
          : poll.winner
            ? "Closed. The winner is lit."
            : "Closed with nobody voting."}
      </p>
    </section>
  );
}

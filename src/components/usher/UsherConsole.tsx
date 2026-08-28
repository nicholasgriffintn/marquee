import { useState } from "react";

import { showingNow } from "../../domain/usher";
import { classNames } from "../../lib/class-names";
import { ArrowIcon } from "../../ui";
import { UsherMark } from "./UsherMark";

import styles from "./UsherConsole.module.css";

const SEED_PROMPTS = [
  "Something short and funny",
  "A slow burn for a rainy night",
  "Watch with my kids",
];

export function UsherConsole({
  isAsking,
  isPicking,
  isIdle,
  hasAsked,
  onAsk,
  onPick,
  onOrder,
}: {
  isAsking: boolean;
  isPicking: boolean;
  isIdle: boolean;
  hasAsked: boolean;
  onAsk: (prompt: string) => void;
  onPick: () => void;
  onOrder: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const isBusy = isAsking || isPicking;
  const showing = showingNow();

  return (
    <div className={styles.console}>
      {isIdle && !hasAsked && !isBusy && <p className={styles.nudge}>{showing.nudge}</p>}

      <form
        className={styles.ask}
        onSubmit={(event) => {
          event.preventDefault();
          onAsk(prompt);
        }}
      >
        <span className={styles.face}>
          <UsherMark face={isBusy ? "thinking" : "idle"} crop="head" />
        </span>
        <input
          className={styles.input}
          maxLength={1_000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask the Usher. 90 mins, clever but not bleak…"
          aria-label="Ask the Usher for something to watch"
        />
        <button
          type="submit"
          className={styles.send}
          disabled={isBusy || !prompt.trim()}
          aria-label="Ask the Usher"
        >
          {isAsking ? "…" : <ArrowIcon />}
        </button>
      </form>

      <div className={styles.row}>
        <button
          type="button"
          className={classNames(styles.decide, isIdle && !hasAsked && styles.nudging)}
          disabled={isBusy}
          onClick={onPick}
        >
          {isPicking ? "Deciding…" : "Just pick something"}
        </button>
        <button type="button" className={styles.order} disabled={isBusy} onClick={onOrder}>
          Ask me three things
        </button>
        {!hasAsked &&
          SEED_PROMPTS.map((seed) => (
            <button
              key={seed}
              type="button"
              className={styles.seed}
              disabled={isBusy}
              onClick={() => {
                setPrompt(seed);
                onAsk(seed);
              }}
            >
              {seed}
            </button>
          ))}
      </div>
    </div>
  );
}

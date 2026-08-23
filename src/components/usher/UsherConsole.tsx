import { useState } from "react";

import { showingNow } from "../../domain/usher";
import { ArrowIcon } from "../ui";
import { UsherMark } from "./UsherMark";

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
    <div className="usher-console">
      {isIdle && !hasAsked && !isBusy && <p className="usher-nudge">{showing.nudge}</p>}

      <form
        className="usher-ask"
        onSubmit={(event) => {
          event.preventDefault();
          onAsk(prompt);
        }}
      >
        <span className="usher-ask-face">
          <UsherMark face={isBusy ? "thinking" : "idle"} crop="head" />
        </span>
        <input
          maxLength={1_000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask the Usher. 90 mins, clever but not bleak…"
          aria-label="Ask the Usher for something to watch"
        />
        <button type="submit" disabled={isBusy || !prompt.trim()} aria-label="Ask the Usher">
          {isAsking ? "…" : <ArrowIcon />}
        </button>
      </form>

      <div className="usher-console-row">
        <button
          type="button"
          className={`usher-decide${isIdle && !hasAsked ? " nudging" : ""}`}
          disabled={isBusy}
          onClick={onPick}
        >
          {isPicking ? "Deciding…" : "Just pick something"}
        </button>
        <button type="button" className="usher-order-start" disabled={isBusy} onClick={onOrder}>
          Ask me three things
        </button>
        {!hasAsked &&
          SEED_PROMPTS.map((seed) => (
            <button
              key={seed}
              type="button"
              className="usher-seed"
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

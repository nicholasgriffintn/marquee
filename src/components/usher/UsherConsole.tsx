import { useState } from "react";

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
}: {
  isAsking: boolean;
  isPicking: boolean;
  isIdle: boolean;
  hasAsked: boolean;
  onAsk: (prompt: string) => void;
  onPick: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const isBusy = isAsking || isPicking;

  return (
    <div className="usher-console">
      {isIdle && !hasAsked && !isBusy && <p className="usher-nudge">Still deciding? I'll pick.</p>}

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

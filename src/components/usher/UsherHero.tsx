import { useState } from "react";
import { Link } from "react-router-dom";

import type { MediaTitle } from "../../domain/catalog";
import type { UsherFace } from "../../domain/usher";
import type { CuratorState } from "../../hooks/useCurator";
import type { UsherPickState } from "../../hooks/useUsher";
import { heroTitleClass, mediaMeta, scoreLabel } from "../../lib/media";
import { TitleArt } from "../TitleArt";
import { UsherMark } from "./UsherMark";

const REFINEMENTS = ["Shorter", "Lighter", "Older", "Weirder", "More acclaimed"];

export function UsherHero({
  curator,
  error,
  isAsking,
  isPinned,
  pick,
  aside,
  onAsk,
  onClear,
  onOpen,
  onPin,
  onReject,
}: {
  curator: CuratorState;
  error: string;
  isAsking: boolean;
  isPinned: boolean;
  pick: UsherPickState;
  aside: string;
  onAsk: (prompt: string, isRefinement?: boolean) => void;
  onClear: () => void;
  onOpen: (item: MediaTitle) => void;
  onPin: () => void;
  onReject: (scope?: "never") => void;
}) {
  const [selection, setSelection] = useState({ prompt: "", id: "" });

  if (aside) {
    return (
      <section className="hero-section usher-hero usher-hero-aside hero-empty">
        <div className="hero-gradient" />
        <button type="button" className="usher-exit" onClick={onClear}>
          ← Back to tonight
        </button>
        <div className="usher-hero-figure" aria-hidden="true">
          <UsherMark face="idle" className="usher-figure" />
        </div>
        <div className="hero-copy">
          <div className="usher-hero-head">
            <UsherMark face="idle" crop="head" />
            <p>
              <span>The Usher</span>
              <em>since you asked</em>
            </p>
          </div>
          <p className="usher-aside-line">{aside}</p>
          <div className="hero-actions">
            <Link className="button-link" to="/usher">
              There is a film about it
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const isPick = Boolean(pick.item || pick.isPicking || pick.error);
  const activeId = selection.prompt === curator.prompt ? selection.id : "";
  const active = isPick
    ? pick.item
    : (curator.items.find((item) => item.id === activeId) ?? curator.items[0] ?? null);
  const failure = isPick ? pick.error : error;
  const isThinking = isPick ? pick.isPicking : curator.isStreaming || isAsking;
  const face: UsherFace = failure ? "unimpressed" : isThinking ? "thinking" : "pleased";
  const line = isPick ? pick.line : curator.summary || curator.status || "Reading the room.";

  return (
    <section
      className={`hero-section usher-hero${isPick ? " usher-hero-pick" : ""}${
        active?.backdropUrl ? "" : " hero-empty"
      }`}
    >
      {active && (
        <div className="hero-art" aria-hidden="true">
          <TitleArt
            url={active.backdropUrl}
            seed={active.id}
            label={active.title}
            width={1280}
            kind="backdrop"
            wide
            eager
          />
        </div>
      )}
      <div className="hero-gradient" />

      <button type="button" className="usher-exit" onClick={onClear}>
        ← Back to tonight
      </button>

      {isPick && (
        <div className="usher-hero-figure" aria-hidden="true">
          <UsherMark face={face} className="usher-figure" />
        </div>
      )}

      <div className="hero-copy">
        <div className="usher-hero-head">
          <UsherMark face={face} crop="head" />
          <p>
            <span>The Usher</span>
            <em>
              {isPick
                ? isThinking
                  ? "picking something"
                  : "my pick for tonight"
                : `you asked: “${curator.prompt}”`}
            </em>
          </p>
        </div>

        {failure ? (
          <div className="honest-empty" aria-live="polite">
            <h1>No.</h1>
            <p>{failure}</p>
          </div>
        ) : active ? (
          <>
            <h1 className={heroTitleClass(active.title)}>{active.title}</h1>
            <p className="hero-meta">
              {mediaMeta(active)} · {scoreLabel(active)}
            </p>
            <p className="usher-narration" aria-live="polite">
              {line}
              {curator.isStreaming && !isPick && <i className="curator-caret" />}
            </p>
            {isPick && pick.facts.length > 0 && (
              <ul className="usher-facts">
                {pick.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            )}
            <div className="hero-actions">
              <button type="button" className="hero-play" onClick={() => onOpen(active)}>
                <span className="play-icon">↗</span> See where to watch
              </button>
              {isPick ? (
                <>
                  <button
                    type="button"
                    className="usher-pin"
                    disabled={isThinking}
                    onClick={() => onReject()}
                  >
                    Not that
                  </button>
                  <button
                    type="button"
                    className="usher-quiet"
                    disabled={isThinking}
                    onClick={() => onReject("never")}
                  >
                    Never suggest this again
                  </button>
                </>
              ) : (
                curator.items.length > 1 && (
                  <button
                    type="button"
                    className="usher-pin"
                    disabled={isPinned || curator.isStreaming}
                    onClick={onPin}
                  >
                    {isPinned ? "Pinned" : "Pin this shelf"}
                  </button>
                )
              )}
            </div>
          </>
        ) : (
          <div className="hero-skeleton" aria-hidden="true">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-meta" />
            <span className="skeleton skeleton-line" />
          </div>
        )}

        {!isPick && curator.items.length > 1 && (
          <div className="usher-strip" aria-label="The rest of the selection">
            {curator.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === active?.id ? "active" : ""}
                aria-current={item.id === active?.id}
                onClick={() => setSelection({ prompt: curator.prompt, id: item.id })}
              >
                <TitleArt
                  url={item.posterUrl}
                  seed={item.id}
                  label={item.title}
                  width={160}
                  alt={item.title}
                />
              </button>
            ))}
          </div>
        )}

        {!isPick && curator.items.length > 0 && !curator.isStreaming && (
          <div className="curator-refine">
            <span>Refine</span>
            {REFINEMENTS.map((refinement) => (
              <button
                key={refinement}
                type="button"
                disabled={isAsking}
                onClick={() => onAsk(refinement, true)}
              >
                {refinement}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

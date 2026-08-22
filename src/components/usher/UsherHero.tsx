import { useState } from "react";

import type { MediaTitle } from "../../domain/catalog";
import type { UsherFace } from "../../domain/usher";
import type { CuratorState } from "../../hooks/useCurator";
import type { UsherPickState } from "../../hooks/useUsher";
import { artwork, artworkSrcSet, heroTitleClass, mediaMeta, scoreLabel } from "../../lib/media";
import { ArtPlaceholder } from "../ArtPlaceholder";
import { UsherMark } from "./UsherMark";

const REFINEMENTS = ["Shorter", "Lighter", "Older", "Weirder", "More acclaimed"];

export function UsherHero({
  curator,
  error,
  isAsking,
  isPinned,
  pick,
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
  onAsk: (prompt: string, isRefinement?: boolean) => void;
  onClear: () => void;
  onOpen: (item: MediaTitle) => void;
  onPin: () => void;
  onReject: () => void;
}) {
  const [selection, setSelection] = useState({ prompt: "", id: "" });
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
          {active.backdropUrl ? (
            <img
              src={artwork(active.backdropUrl, 1280, "backdrop") ?? active.backdropUrl}
              srcSet={artworkSrcSet(active.backdropUrl, 1280, "backdrop")}
              alt=""
              decoding="async"
            />
          ) : (
            <ArtPlaceholder seed={active.id} label={active.title} wide />
          )}
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
            <div className="hero-actions">
              <button type="button" className="hero-play" onClick={() => onOpen(active)}>
                <span className="play-icon">↗</span> See where to watch
              </button>
              {isPick ? (
                <button type="button" className="usher-pin" onClick={onReject}>
                  Not that
                </button>
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
                {item.posterUrl ? (
                  <img
                    src={artwork(item.posterUrl, 160) ?? item.posterUrl}
                    srcSet={artworkSrcSet(item.posterUrl, 160)}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <ArtPlaceholder seed={item.id} label={item.title} />
                )}
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

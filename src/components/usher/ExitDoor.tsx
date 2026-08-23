import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { UsherMark } from "./UsherMark";

export type ExitKind = "provider" | "trailer" | "tmdb" | "wikipedia" | "imdb" | "cinema" | "other";

export type Exit = { href: string; label: string; kind: ExitKind };

const SKIP_KEY = "marquee.skipExitWarning";

const LINES: Record<ExitKind, (label: string) => string> = {
  provider: (label) =>
    `${label} is through that door. I don't work there, and I can't help you once you're through it.`,
  trailer: () => "The trailer is next door. They will try to sell you three more on the way out.",
  tmdb: () => "The records office. Nearly everything I know about this came from in there.",
  wikipedia: () => "The library. Mind the spoilers, they do not sort them.",
  imdb: () => "Another lot's records. Perfectly good. Do not read the comments.",
  cinema: (label) =>
    `${label}. A proper house, with a proper screen. Go on, then — I'll still be here.`,
  other: () => "That is outside the building. I cannot vouch for it.",
};

export function shouldWarnOnExit() {
  try {
    return window.localStorage.getItem(SKIP_KEY) !== "1";
  } catch {
    return true;
  }
}

function rememberSkip() {
  try {
    window.localStorage.setItem(SKIP_KEY, "1");
  } catch {
    return;
  }
}

function hostOf(href: string) {
  try {
    return new URL(href).host.replace(/^www\./u, "");
  } catch {
    return href;
  }
}

export function ExitDoor({ exit, onClose }: { exit: Exit; onClose: () => void }) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef<HTMLInputElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  useEffect(() => {
    stayRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", onKey, true);

    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function leave() {
    if (skipRef.current?.checked) {
      rememberSkip();
    }

    window.open(exit.href, "_blank", "noreferrer");
    onClose();
  }

  return createPortal(
    <div className="exit-shade" ref={shadeRef}>
      <button type="button" className="exit-backdrop" aria-label="Stay here" onClick={onClose} />
      <div className="exit-door" role="alertdialog" aria-modal="true" aria-labelledby="exit-title">
        <p className="exit-sign" aria-hidden="true">
          <span>Exit</span>
        </p>

        <div className="exit-body">
          <UsherMark face="unimpressed" crop="head" />
          <div>
            <h2 id="exit-title">You are leaving the building.</h2>
            <p className="exit-line">{LINES[exit.kind](exit.label)}</p>
            <p className="exit-host">
              {exit.label} <em>{hostOf(exit.href)}</em>
            </p>
          </div>
        </div>

        <div className="exit-actions">
          <button type="button" className="exit-go" onClick={leave}>
            Go through
          </button>
          <button type="button" ref={stayRef} onClick={onClose}>
            Stay here
          </button>
        </div>

        <label className="exit-skip">
          <input type="checkbox" ref={skipRef} />
          Stop telling me. I know where the door is.
        </label>
      </div>
    </div>,
    document.body,
  );
}

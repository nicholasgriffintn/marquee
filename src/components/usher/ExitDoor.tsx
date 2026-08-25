import { useEffect, useId, useLayoutEffect, useRef } from "react";

import { focusableElements } from "../../lib/focus";
import { UsherMark } from "./UsherMark";

export type ExitKind = "provider" | "trailer" | "tmdb" | "wikipedia" | "imdb" | "cinema" | "other";

export type Exit = {
  href: string;
  label: string;
  kind: ExitKind;
  providerId?: string;
  monetization?: string;
};

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

export function ExitDoor({
  exit,
  onLeave,
  onClose,
}: {
  exit: Exit;
  onLeave?: () => void;
  onClose: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const skipRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  useLayoutEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    stayRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;

      if (!dialog) {
        return;
      }

      const focusable = focusableElements(dialog);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();

        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (!dialog.contains(active) || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!dialog.contains(active) || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    function containFocus(event: FocusEvent) {
      const dialog = dialogRef.current;

      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) {
        stayRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", containFocus);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", containFocus);

      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [onClose]);

  function leave() {
    if (skipRef.current?.checked) {
      rememberSkip();
    }

    onLeave?.();
    window.open(exit.href, "_blank", "noreferrer");
    onClose();
  }

  return (
    <div className="exit-shade">
      <button
        type="button"
        className="exit-backdrop"
        aria-label="Stay here"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="exit-door"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <p className="exit-sign" aria-hidden="true">
          <span>Exit</span>
        </p>

        <div className="exit-body">
          <UsherMark face="unimpressed" crop="head" />
          <div>
            <h2 id={titleId}>You are leaving the building.</h2>
            <p className="exit-line" id={descriptionId}>
              {LINES[exit.kind](exit.label)}
            </p>
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
    </div>
  );
}

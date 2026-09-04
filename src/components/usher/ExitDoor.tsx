import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

import { focusableElements } from "../../lib/focus";
import { readStoredFlag, writeStoredFlag } from "../../lib/storage";
import { Button, Cluster, Heading, Text } from "../../ui";
import { UsherMark } from "./UsherMark";

import styles from "./ExitDoor.module.css";

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
  return !readStoredFlag(SKIP_KEY);
}

function rememberSkip() {
  writeStoredFlag(SKIP_KEY);
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
  const shadeRef = useRef<HTMLDialogElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    shadeRef.current?.showModal();
  }, []);

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

  function onShadeClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    // Clicking the backdrop dismisses the dialog same as Escape or "Stay here" -
    // both keyboard-reachable, so the backdrop itself doesn't need its own key handler.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog ref={shadeRef} className={styles.shade} onClick={onShadeClick} onCancel={onCancel}>
      <div
        ref={dialogRef}
        className={styles.door}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <p className={styles.sign} aria-hidden="true">
          <span>Exit</span>
        </p>

        <div className={styles.body}>
          <UsherMark face="unimpressed" crop="head" className={styles.mark} />
          <div>
            <Heading level={2} size="subhead" family="serif" id={titleId} className={styles.title}>
              You are leaving the building.
            </Heading>
            <Text family="serif" italic id={descriptionId} className={styles.line}>
              {LINES[exit.kind](exit.label)}
            </Text>
            <p className={styles.host}>
              {exit.label} <em>{hostOf(exit.href)}</em>
            </p>
          </div>
        </div>

        <Cluster gap={2} className={styles.actions}>
          <Button variant="primary" size="md" onClick={leave}>
            Go through
          </Button>
          <Button variant="secondary" size="md" buttonRef={stayRef} onClick={onClose}>
            Stay here
          </Button>
        </Cluster>

        <label className={styles.skip}>
          <input type="checkbox" ref={skipRef} className={styles.skipBox} />
          Stop telling me. I know where the door is.
        </label>
      </div>
    </dialog>
  );
}

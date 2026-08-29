import { useLayoutEffect, useRef, type ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { CloseIcon } from "./Icons";

import styles from "./Modal.module.css";

export function Modal({
  onClose,
  labelledBy,
  className,
  children,
}: {
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    panelRef.current?.showModal();
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={panelRef}
        className={classNames(styles.shell, className)}
        aria-modal="true"
        aria-labelledby={labelledBy}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
        {children}
      </dialog>
    </div>
  );
}

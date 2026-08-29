import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { Heading, type HeadingSize } from "./Heading";
import { Text } from "./Text";

import styles from "./Feedback.module.css";

export function Spinner({
  surface = "dark",
  className,
}: {
  surface?: "dark" | "paper";
  className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      className={classNames(styles.spinner, surface === "paper" && styles.spinnerPaper, className)}
    />
  );
}

export function StatusNote({
  busy = false,
  tone = "muted",
  surface = "dark",
  role,
  live,
  className,
  children,
}: {
  busy?: boolean;
  tone?: "muted" | "warning";
  surface?: "dark" | "paper";
  role?: "alert" | "status";
  live?: "polite" | "off";
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={role}
      aria-live={live}
      className={classNames(
        styles.note,
        tone === "warning" && styles.noteWarning,
        surface === "paper" && styles.notePaper,
        className,
      )}
    >
      {busy && <Spinner surface={surface} />}
      {children}
    </p>
  );
}

export function Callout({
  tone = "error",
  role = "alert",
  actions,
  className,
  children,
}: {
  tone?: "error" | "info";
  role?: "alert" | "status" | "note";
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className={classNames(styles.callout, tone === "info" && styles.calloutInfo, className)}
    >
      <div className={styles.calloutBody}>{children}</div>
      {actions && <div className={styles.calloutActions}>{actions}</div>}
    </div>
  );
}

export function EmptyState({
  mark,
  heading,
  headingId,
  size = "heading",
  surface = "dark",
  description,
  actions,
  className,
  children,
}: {
  mark?: ReactNode;
  heading?: ReactNode;
  headingId?: string;
  size?: HeadingSize;
  surface?: "dark" | "paper";
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={classNames(styles.empty, surface === "paper" && styles.emptyPaper, className)}>
      {mark}
      {heading && (
        <Heading level={2} size={size} id={headingId} className={styles.emptyHeading}>
          {heading}
        </Heading>
      )}
      {description && (
        <Text tone={surface === "paper" ? "inkMuted" : "muted"} className={styles.emptyDescription}>
          {description}
        </Text>
      )}
      {actions && <div className={styles.emptyActions}>{actions}</div>}
      {children}
    </div>
  );
}

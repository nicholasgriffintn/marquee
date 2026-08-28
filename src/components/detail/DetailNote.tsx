import type { ReactNode } from "react";

import { classNames } from "../../lib/class-names";
import { Eyebrow } from "../../ui";

import styles from "./DetailNote.module.css";

export type DetailAccent = "blue" | "acid" | "line" | "none";

const ACCENT_CLASS: Record<DetailAccent, string> = {
  blue: styles.accentBlue,
  acid: styles.accentAcid,
  line: styles.accentLine,
  none: styles.accentNone,
};

export function DetailCredit({ children }: { children: ReactNode }) {
  return <small className={styles.credit}>{children}</small>;
}

export function DetailNote({
  label,
  badge,
  accent = "blue",
  credit,
  className,
  children,
}: {
  label?: ReactNode;
  badge?: ReactNode;
  accent?: DetailAccent;
  credit?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames(styles.note, ACCENT_CLASS[accent], className)}>
      {label && (
        <Eyebrow size="sm" weight="heavy" tone="inkMuted" className={styles.label}>
          {badge && <i className={styles.badge}>{badge}</i>}
          {label}
        </Eyebrow>
      )}
      {children}
      {credit && <DetailCredit>{credit}</DetailCredit>}
    </div>
  );
}

export function DetailLine({
  label,
  accent = "blue",
  credit,
  children,
}: {
  label: ReactNode;
  accent?: DetailAccent;
  credit?: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className={classNames(styles.line, ACCENT_CLASS[accent])}>
      <span className={styles.lineLabel}>{label}</span> {children}
      {credit && <DetailCredit>{credit}</DetailCredit>}
    </p>
  );
}

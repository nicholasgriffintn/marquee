import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { Eyebrow } from "./Eyebrow";

import styles from "./Stats.module.css";

export type StatSurface = "dark" | "paper" | "accent";

const SURFACE_CLASS: Record<StatSurface, string> = {
  dark: styles.dark,
  paper: styles.paper,
  accent: styles.accent,
};

export function StatGrid({
  min = "150px",
  columns,
  surface = "dark",
  className,
  children,
}: {
  min?: string;
  columns?: number;
  surface?: StatSurface;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={classNames(styles.grid, SURFACE_CLASS[surface], className)}
      style={
        columns
          ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
          : { gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }
      }
    >
      {children}
    </div>
  );
}

export function Stat({
  value,
  label,
  size = "md",
  tone,
  onClick,
  className,
  children,
}: {
  value: ReactNode;
  label: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "warning";
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <strong className={classNames(styles.value, styles[size], tone === "warning" && styles.warn)}>
        {value}
      </strong>
      <Eyebrow size="sm" weight="regular" tracking="label" className={styles.label}>
        {label}
      </Eyebrow>
      {children}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classNames(styles.cell, styles.action, className)}
      >
        {body}
      </button>
    );
  }

  return <div className={classNames(styles.cell, className)}>{body}</div>;
}

export function FactList({
  min = "200px",
  className,
  children,
}: {
  min?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl
      className={classNames(styles.facts, className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }}
    >
      {children}
    </dl>
  );
}

export function Fact({
  term,
  size = "sm",
  className,
  children,
}: {
  term: ReactNode;
  size?: "sm" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames(styles.fact, className)}>
      <Eyebrow as="dt" size="sm">
        {term}
      </Eyebrow>
      <dd className={classNames(styles.factValue, size === "lg" && styles.factValueLarge)}>
        {children}
      </dd>
    </div>
  );
}

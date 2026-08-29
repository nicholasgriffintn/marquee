import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";

import styles from "./Stack.module.css";

export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type Align = "start" | "center" | "end" | "baseline" | "stretch";
type Justify = "start" | "center" | "end" | "between";

const GAP_CLASS: Record<SpaceStep, string> = {
  0: styles.gap0,
  1: styles.gap1,
  2: styles.gap2,
  3: styles.gap3,
  4: styles.gap4,
  5: styles.gap5,
  6: styles.gap6,
  7: styles.gap7,
  8: styles.gap8,
};

const ALIGN_CLASS: Record<Align, string> = {
  start: styles.alignStart,
  center: styles.alignCenter,
  end: styles.alignEnd,
  baseline: styles.alignBaseline,
  stretch: styles.alignStretch,
};

const JUSTIFY_CLASS: Record<Justify, string> = {
  start: styles.justifyStart,
  center: styles.justifyCenter,
  end: styles.justifyEnd,
  between: styles.justifyBetween,
};

export function Stack({
  as: Tag = "div",
  gap = 4,
  align,
  className,
  children,
}: {
  as?: "div" | "section" | "li" | "ul" | "ol" | "form" | "article" | "header" | "footer";
  gap?: SpaceStep;
  align?: Align;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={classNames(styles.stack, GAP_CLASS[gap], align && ALIGN_CLASS[align], className)}
    >
      {children}
    </Tag>
  );
}

export function Cluster({
  as: Tag = "div",
  gap = 3,
  align = "center",
  justify,
  wrap = true,
  className,
  children,
}: {
  as?: "div" | "span" | "ul" | "li" | "nav" | "header" | "footer";
  gap?: SpaceStep;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={classNames(
        styles.cluster,
        GAP_CLASS[gap],
        ALIGN_CLASS[align],
        justify && JUSTIFY_CLASS[justify],
        wrap && styles.wrap,
        className,
      )}
    >
      {children}
    </Tag>
  );
}

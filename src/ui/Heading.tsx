import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";

import styles from "./Heading.module.css";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingSize =
  | "display"
  | "title"
  | "heading"
  | "section"
  | "subhead"
  | "compact"
  | "label";
export type HeadingTone = "default" | "muted" | "accent" | "ink" | "inkMuted";

const SIZE_FOR_LEVEL: Record<HeadingLevel, HeadingSize> = {
  1: "display",
  2: "heading",
  3: "section",
  4: "subhead",
  5: "compact",
  6: "label",
};

const TONE_CLASS: Record<HeadingTone, string> = {
  default: styles.toneDefault,
  muted: styles.toneMuted,
  accent: styles.toneAccent,
  ink: styles.toneInk,
  inkMuted: styles.toneInkMuted,
};

export function Heading({
  level,
  size,
  tone = "default",
  family = "sans",
  id,
  className,
  children,
}: {
  level: HeadingLevel;
  size?: HeadingSize;
  tone?: HeadingTone;
  family?: "sans" | "serif";
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;

  return (
    <Tag
      id={id}
      className={classNames(
        styles.root,
        styles[size ?? SIZE_FOR_LEVEL[level]],
        TONE_CLASS[tone],
        styles[family],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

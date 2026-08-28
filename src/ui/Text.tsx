import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";
import styles from "./Text.module.css";

export type TextSize = "lede" | "body" | "sm" | "xs";
export type TextTone =
  "default" | "muted" | "accent" | "ink" | "inkMuted" | "warning";

const TONE_CLASS: Record<TextTone, string> = {
  default: styles.toneDefault,
  muted: styles.toneMuted,
  accent: styles.toneAccent,
  ink: styles.toneInk,
  inkMuted: styles.toneInkMuted,
  warning: styles.toneWarning,
};

export function Text({
  as: Tag = "p",
  size = "body",
  tone = "default",
  family = "sans",
  italic = false,
  leading = "normal",
  measure = false,
  className,
  id,
  role,
  children,
}: {
  as?: "p" | "span" | "div" | "small" | "strong" | "blockquote" | "figcaption";
  size?: TextSize;
  tone?: TextTone;
  family?: "sans" | "serif" | "mono";
  italic?: boolean;
  leading?: "snug" | "normal" | "relaxed";
  measure?: boolean;
  className?: string;
  id?: string;
  role?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      role={role}
      className={classNames(
        styles.root,
        styles[size],
        TONE_CLASS[tone],
        styles[family],
        styles[leading],
        italic && styles.italic,
        measure && styles.measure,
        className,
      )}
    >
      {children}
    </Tag>
  );
}

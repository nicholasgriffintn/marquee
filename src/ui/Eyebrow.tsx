import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";
import styles from "./Eyebrow.module.css";

export type EyebrowTone = "muted" | "accent" | "ink" | "inkMuted" | "default";

const TONE_CLASS: Record<EyebrowTone, string> = {
  muted: styles.toneMuted,
  accent: styles.toneAccent,
  ink: styles.toneInk,
  inkMuted: styles.toneInkMuted,
  default: styles.toneDefault,
};

export function Eyebrow({
  as: Tag = "span",
  size = "md",
  tone = "muted",
  weight = "bold",
  tracking = "label",
  id,
  htmlFor,
  className,
  children,
}: {
  as?:
    | "span"
    | "p"
    | "div"
    | "small"
    | "dt"
    | "strong"
    | "legend"
    | "figcaption"
    | "label";
  size?: "sm" | "md" | "lg";
  tone?: EyebrowTone;
  weight?: "regular" | "bold" | "heavy";
  tracking?: "label" | "wide";
  id?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  const composed = classNames(
    styles.root,
    styles[size],
    TONE_CLASS[tone],
    styles[weight],
    styles[tracking],
    className,
  );

  if (Tag === "label") {
    return (
      <label id={id} htmlFor={htmlFor} className={composed}>
        {children}
      </label>
    );
  }

  return (
    <Tag id={id} className={composed}>
      {children}
    </Tag>
  );
}

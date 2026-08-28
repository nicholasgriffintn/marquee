import { classNames } from "../lib/class-names";
import styles from "./Skeleton.module.css";

export type SkeletonShape =
  | "title"
  | "heading"
  | "eyebrow"
  | "meta"
  | "line"
  | "button"
  | "art"
  | "block";

const SHAPE_CLASS: Record<SkeletonShape, string> = {
  title: styles.title,
  heading: styles.heading,
  eyebrow: styles.eyebrow,
  meta: styles.meta,
  line: styles.line,
  button: styles.button,
  art: styles.art,
  block: styles.block,
};

export function Skeleton({
  shape = "line",
  short = false,
  className,
}: {
  shape?: SkeletonShape;
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        styles.skeleton,
        SHAPE_CLASS[shape],
        short && styles.short,
        className,
      )}
    />
  );
}

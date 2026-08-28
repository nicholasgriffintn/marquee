import { classNames } from "../lib/class-names";

import styles from "./Avatar.module.css";

export function Avatar({
  url,
  name,
  size = "md",
  shape = "square",
  className,
}: {
  url?: string | null;
  name: string;
  size?: "sm" | "md";
  shape?: "square" | "round";
  className?: string;
}) {
  const composed = classNames(
    styles.avatar,
    styles[size],
    shape === "round" && styles.round,
    className,
  );

  if (url) {
    return <img className={composed} src={url} alt="" />;
  }

  return <span className={composed}>{name.slice(0, 1)}</span>;
}

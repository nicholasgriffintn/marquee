import { useState } from "react";

import { avatarForName } from "../domain/avatars";
import { classNames } from "../lib/class-names";
import { GeneratedAvatar } from "./GeneratedAvatar";

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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = url?.trim();
  const composed = classNames(
    styles.avatar,
    styles[size],
    shape === "round" && styles.round,
    className,
  );

  if (source && source !== failedUrl) {
    return (
      <img
        key={source}
        className={composed}
        src={source}
        alt=""
        onError={() => setFailedUrl(source)}
      />
    );
  }

  return (
    <span className={classNames(composed, styles.fallback)} aria-hidden="true">
      <GeneratedAvatar avatar={avatarForName(name)} size={size === "sm" ? 26 : 38} decorative />
    </span>
  );
}

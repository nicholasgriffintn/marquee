import type { ReactNode } from "react";

import type { ProviderState } from "../../domain/providers";
import { classNames } from "../../lib/class-names";

import styles from "./SourceStatus.module.css";

const KIND_CLASS: Record<ProviderState, string> = {
  live: styles.live,
  stale: styles.stale,
  unresolved: styles.unresolved,
  "out-of-scope": styles.outOfScope,
  failed: styles.failed,
};

export function SourceStatus({
  as: Tag = "span",
  state,
  className,
  children,
}: {
  as?: "span" | "dt";
  state: ProviderState;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={classNames(styles.status, KIND_CLASS[state], className)}>{children}</Tag>;
}

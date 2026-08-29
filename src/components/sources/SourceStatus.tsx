import type { ReactNode } from "react";

import { classNames } from "../../lib/class-names";

import styles from "./SourceStatus.module.css";

export type SourceStatusKind = "feed" | "link" | "marker";

const KIND_CLASS: Record<string, string> = {
  feed: styles.feed,
  link: styles.link,
  marker: styles.marker,
};

export function SourceStatus({
  as: Tag = "span",
  status,
  className,
  children,
}: {
  as?: "span" | "dt";
  status: string;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={classNames(styles.status, KIND_CLASS[status], className)}>{children}</Tag>;
}

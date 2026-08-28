import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { Eyebrow } from "./Eyebrow";
import { Heading, type HeadingSize } from "./Heading";
import styles from "./Page.module.css";
import { Text } from "./Text";

export function Page({
  as: Tag = "section",
  className,
  labelledBy,
  children,
}: {
  as?: "section" | "div" | "main" | "article";
  className?: string;
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={classNames(styles.page, className)}
    >
      {children}
    </Tag>
  );
}

export function PageHeader({
  eyebrow,
  heading,
  headingId,
  size = "display",
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  heading: ReactNode;
  headingId?: string;
  size?: HeadingSize;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={classNames(styles.header, className)}>
      <div className={styles.headerMain}>
        {eyebrow && (
          <Eyebrow
            tone="accent"
            tracking="wide"
            className={styles.headerEyebrow}
          >
            {eyebrow}
          </Eyebrow>
        )}
        <Heading level={1} size={size} id={headingId}>
          {heading}
        </Heading>
      </div>
      {(description ?? actions) ? (
        <div className={styles.headerAside}>
          {description && (
            <Text tone="muted" className={styles.headerDescription}>
              {description}
            </Text>
          )}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

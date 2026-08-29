import { useId, type ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { Eyebrow } from "./Eyebrow";
import { Heading, type HeadingLevel, type HeadingSize } from "./Heading";
import { Text } from "./Text";

import styles from "./Section.module.css";

export function SectionHeader({
  eyebrow,
  heading,
  headingId,
  level = 2,
  size = "section",
  description,
  actions,
  bleed = false,
  className,
}: {
  eyebrow?: ReactNode;
  heading: ReactNode;
  headingId?: string;
  level?: HeadingLevel;
  size?: HeadingSize;
  description?: ReactNode;
  actions?: ReactNode;
  bleed?: boolean;
  className?: string;
}) {
  return (
    <div className={classNames(styles.header, bleed && styles.headerBleed, className)}>
      <div className={styles.headerMain}>
        {eyebrow && (
          <Eyebrow tone="accent" weight="regular" className={styles.headerEyebrow}>
            {eyebrow}
          </Eyebrow>
        )}
        <Heading level={level} size={size} id={headingId}>
          {heading}
        </Heading>
        {description && (
          <Text tone="muted" size="sm" className={styles.headerDescription}>
            {description}
          </Text>
        )}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );
}

export function Section({
  eyebrow,
  heading,
  level = 2,
  size = "section",
  description,
  actions,
  bleed,
  headerClassName,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  heading: ReactNode;
  level?: HeadingLevel;
  size?: HeadingSize;
  description?: ReactNode;
  actions?: ReactNode;
  bleed?: boolean;
  headerClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={classNames(styles.section, className)}>
      <SectionHeader
        eyebrow={eyebrow}
        heading={heading}
        headingId={headingId}
        level={level}
        size={size}
        description={description}
        actions={actions}
        bleed={bleed}
        className={headerClassName}
      />
      {children}
    </section>
  );
}

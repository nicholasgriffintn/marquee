import { useId, type ReactNode } from "react";

import { classNames } from "../../lib/class-names";
import { Heading, Text } from "../../ui";

import styles from "./NotebookSection.module.css";

export function NotebookSection({
  id,
  title,
  lede,
  hidden = false,
  children,
}: {
    id: string;
  title: string;
  lede: string;
    hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} id={id} aria-labelledby={`${id}-title`} hidden={hidden}>
      <div className={styles.divider}>
        <Heading level={2} size="subhead" family="serif" id={`${id}-title`}>
          {title}
        </Heading>
      </div>
      <NotebookLede className={styles.sectionLede}>{lede}</NotebookLede>
      {children}
    </section>
  );
}

export function NotebookLede({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Text tone="muted" leading="relaxed" className={classNames(styles.lede, className)}>
      {children}
    </Text>
  );
}

export function NotebookGroup({
  heading,
  lede,
  bare = false,
  children,
}: {
  heading: string;
  lede?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={bare ? undefined : headingId}
      className={classNames(styles.group, bare && styles.groupBare)}
    >
      {!bare && (
        <>
          <Heading level={2} size="label" id={headingId} className={styles.groupHeading}>
            {heading}
          </Heading>
          {lede && <NotebookLede>{lede}</NotebookLede>}
        </>
      )}
      {children}
    </section>
  );
}

export function NotebookSubheading({ children }: { children: ReactNode }) {
  return (
    <Heading level={3} size="label" tone="muted" className={styles.subheading}>
      {children}
    </Heading>
  );
}

export function NotebookEmpty({ children }: { children: ReactNode }) {
  return (
    <Text tone="muted" leading="relaxed" className={styles.empty}>
      {children}
    </Text>
  );
}

export function NotebookAside({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" tone="muted" leading="relaxed" className={styles.aside}>
      {children}
    </Text>
  );
}

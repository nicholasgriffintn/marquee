import type { ReactNode, Ref } from "react";

import { classNames } from "../../lib/class-names";
import { ChevronIcon, Eyebrow, Heading } from "../../ui";

import styles from "./Rail.module.css";

export function Rail({
  bleed = true,
  busy,
  railRef,
  className,
  children,
}: {
  bleed?: boolean;
  busy?: boolean;
  railRef?: Ref<HTMLElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      ref={railRef}
      aria-busy={busy}
      className={classNames(styles.rail, bleed && styles.bleed, className)}
    >
      {children}
    </section>
  );
}

export function RailHeading({
  eyebrow,
  heading,
  headingId,
  bleed = true,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  heading: ReactNode;
  headingId?: string;
  bleed?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={classNames(styles.heading, bleed && styles.headingBleed, className)}>
      <div className={styles.headingMain}>
        {eyebrow && (
          <Eyebrow tone="accent" size="sm" weight="regular" className={styles.eyebrow}>
            {eyebrow}
          </Eyebrow>
        )}
        <Heading level={2} size="section" id={headingId} className={styles.title}>
          {heading}
        </Heading>
      </div>
      {actions}
    </div>
  );
}

export function RailTrack({
  bleed = true,
  trackRef,
  className,
  children,
}: {
  bleed?: boolean;
  trackRef?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div ref={trackRef} className={classNames(styles.track, bleed && styles.trackBleed, className)}>
      {children}
    </div>
  );
}

export function RailEmpty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function RailPager({
  pages,
  page,
  atStart,
  atEnd,
  label,
  onTurn,
}: {
  pages: number;
  page: number;
  atStart: boolean;
  atEnd: boolean;
  label: string;
  onTurn: (direction: 1 | -1) => void;
}) {
  return (
    <div className={styles.pager}>
      <span className={styles.pages} aria-hidden="true">
        {Array.from({ length: pages }, (_, index) => (
          <i key={`page-${index}`} className={index === page ? styles.pageCurrent : undefined} />
        ))}
      </span>
      <button
        type="button"
        className={styles.pagerButton}
        aria-label={`Scroll ${label} back`}
        disabled={atStart}
        onClick={() => onTurn(-1)}
      >
        <ChevronIcon back />
      </button>
      <button
        type="button"
        className={styles.pagerButton}
        aria-label={`Scroll ${label} forward`}
        disabled={atEnd}
        onClick={() => onTurn(1)}
      >
        <ChevronIcon />
      </button>
    </div>
  );
}

import type { ReactNode } from "react";

import type { UsherFace } from "../../domain/usher";
import { classNames } from "../../lib/class-names";
import { ChevronIcon, Heading, Skeleton, Text } from "../../ui";
import { Hero, HeroCopy } from "../hero/Hero";
import { UsherMark } from "./UsherMark";

import styles from "./UsherHeroShell.module.css";

export function UsherHero({ empty, children }: { empty?: boolean; children: ReactNode }) {
  return (
    <Hero empty={empty} className={styles.hero}>
      {children}
    </Hero>
  );
}

export function UsherByline({ face, note }: { face: UsherFace; note: ReactNode }) {
  return (
    <div className={styles.byline}>
      <UsherMark face={face} crop="head" className={styles.bylineMark} />
      <p>
        <span>The Usher</span>
        <em>{note}</em>
      </p>
    </div>
  );
}

export function UsherExit({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.exit} onClick={onClick}>
      <ChevronIcon back /> Back to tonight
    </button>
  );
}

export function UsherFigure({ face, busy = false }: { face: UsherFace; busy?: boolean }) {
  return (
    <div className={classNames(styles.figure, busy && styles.figureBusy)} aria-hidden="true">
      <UsherMark face={face} className={styles.figureMark} />
    </div>
  );
}

export function UsherHeroCopy({ children }: { children: ReactNode }) {
  return <HeroCopy className={styles.copy}>{children}</HeroCopy>;
}

export function UsherNarration({ children }: { children: ReactNode }) {
  return (
    <p className={styles.narration} aria-live="polite">
      {children}
    </p>
  );
}

export function UsherCaret() {
  return <i className={styles.caret} />;
}

export function UsherWorking({ status }: { status: string }) {
  return (
    <output className={styles.working} aria-live="polite">
      <span className={styles.film} aria-hidden="true">
        <span className={styles.filmTrack}>
          {Array.from({ length: 10 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
      </span>
      <span className={styles.workingCopy}>
        <span>In the projection booth</span>
        <strong>{status || "Reading the room"}</strong>
      </span>
    </output>
  );
}

export function UsherFacts({ facts, className }: { facts: string[]; className?: string }) {
  if (facts.length === 0) {
    return null;
  }

  return (
    <ul className={classNames(styles.facts, className)}>
      {facts.map((fact) => (
        <li key={fact}>{fact}</li>
      ))}
    </ul>
  );
}

export function UsherRefusal({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div aria-live="polite">
      <Heading level={1} size="display">
        {heading}
      </Heading>
      <Text tone="muted" className={styles.refusal}>
        {children}
      </Text>
    </div>
  );
}

export function UsherHeroSkeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div className={styles.loading} aria-hidden="true">
      <Skeleton shape="title" />
      <Skeleton shape="meta" />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={`line-${index}`} short={index > 0} />
      ))}
    </div>
  );
}

import { useState, type ReactNode } from "react";

import type { TourStop as Stop } from "../../domain/tour";
import { classNames } from "../../lib/class-names";
import { StageCursors } from "../screening/StageCursors";
import { UsherMark } from "../usher/UsherMark";
import { TechNote } from "./TechNote";

import styles from "./TourStop.module.css";

export function TourStop({
  stop,
  index,
  total,
  isActive,
  children,
}: {
  stop: Stop;
  index: number;
  total: number;
  isActive: boolean;
  children?: ReactNode;
}) {
  const [isExplaining, setIsExplaining] = useState(false);

  return (
    <section
      id={stop.id}
      className={classNames(styles.stop, isActive && styles.active)}
      aria-labelledby={`${stop.id}-slug`}
      data-stop={stop.id}
    >
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 className={styles.slug} id={`${stop.id}-slug`}>
            <i>
              {String(index + 1).padStart(2, "0")}
              <em>/{String(total).padStart(2, "0")}</em>
            </i>
            {stop.slug}
          </h2>

          <div className={styles.said}>
            <span className={styles.mark}>
              <UsherMark face={stop.face} crop="head" />
            </span>
            <blockquote className={styles.line}>
              <p>{stop.line}</p>
            </blockquote>
          </div>
        </header>

        {children ? <div className={styles.stage}>{children}</div> : null}

        <footer className={styles.foot}>
          <p className={styles.receipt}>
            <span>What just happened</span>
            {stop.receipt}
          </p>

          <button type="button" className={styles.explain} onClick={() => setIsExplaining(true)}>
            How it works
          </button>
        </footer>
      </div>

      <StageCursors stage={stop.id} />

      {isExplaining && <TechNote stop={stop} onClose={() => setIsExplaining(false)} />}
    </section>
  );
}

import type { ReactNode } from "react";

import { classNames } from "../lib/class-names";
import { Button, Skeleton } from "../ui";

import styles from "./ResultsGrid.module.css";

export function ResultsGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={classNames(styles.grid, className)}>{children}</div>;
}

export function ResultsSkeleton({
  count = 6,
  poster = false,
}: {
  count?: number;
  poster?: boolean;
}) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.card} key={`card-${index}`}>
          <Skeleton
            className={poster ? styles.poster : undefined}
            shape={poster ? "block" : "art"}
          />
          {!poster && <Skeleton shape="meta" className={styles.meta} />}
        </div>
      ))}
    </div>
  );
}

export function LoadMore({ isLoading, onClick }: { isLoading: boolean; onClick: () => void }) {
  return (
    <div className={styles.more}>
      <Button variant="secondary" size="lg" disabled={isLoading} onClick={onClick}>
        {isLoading ? "Loading…" : "Show more"}
      </Button>
    </div>
  );
}

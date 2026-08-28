import { Link } from "react-router-dom";

import { revivalPath, runtimeLabel, SOURCE_LABELS, type RevivalWork } from "../../domain/revival";
import { Eyebrow, PlayIcon } from "../../ui";

import styles from "./RevivalBlock.module.css";

export function RevivalBlock({ works }: { works: RevivalWork[] }) {
  if (works.length === 0) {
    return null;
  }

  return (
    <div className={styles.block}>
      <Eyebrow size="sm" weight="heavy" tone="inkMuted">
        Playing here, free
      </Eyebrow>
      {works.map((work) => (
        <Link className={styles.reel} key={work.id} to={revivalPath(work)}>
          <span className={styles.mark}>
            <PlayIcon />
          </span>
          <span>
            {work.title}
            <small>
              {[
                work.mirrored ? "Our print" : SOURCE_LABELS[work.source],
                runtimeLabel(work.runtimeSeconds),
                "Public domain in the UK",
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
        </Link>
      ))}
    </div>
  );
}

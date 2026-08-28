import type { MediaTitle } from "../domain/catalog";
import { ratingSources } from "../domain/ratings";
import { compactCount } from "../lib/media";

import styles from "./RatingLine.module.css";

export function RatingLine({ item, limit }: { item: MediaTitle; limit?: number }) {
  const sources = ratingSources(item);

  if (sources.length === 0) {
    return <span className={styles.line}>Not yet rated</span>;
  }

  const shown = limit ? sources.slice(0, limit) : sources;
  const votes = shown.find((source) => source.votes)?.votes ?? null;

  return (
    <span className={styles.line}>
      {shown
        .map(
          (source, index) =>
            `${source.label} ${source.display}${index === 0 && source.outOfTen ? " / 10" : ""}`,
        )
        .join(" · ")}
      {votes !== null && <em>{compactCount(votes)} votes</em>}
    </span>
  );
}

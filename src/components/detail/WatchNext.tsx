import type { MediaTitle } from "../../domain/catalog";
import type { InsightPair } from "../../hooks/useTitleInsight";
import { DetailNote } from "./DetailNote";
import { TitlePair } from "./TitlePair";

import styles from "./WatchNext.module.css";

export function WatchNext({
  pairs,
  onOpen,
}: {
  pairs: InsightPair[];
  onOpen: (item: MediaTitle) => void;
}) {
  if (pairs.length === 0) {
    return null;
  }

  return (
    <DetailNote label="Watch next" badge="AI" accent="none" className={styles.block}>
      {pairs.map((pair) => (
        <TitlePair key={pair.item.id} item={pair.item} caption={pair.reason} onOpen={onOpen} />
      ))}
    </DetailNote>
  );
}

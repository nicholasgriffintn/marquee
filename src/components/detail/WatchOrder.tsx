import { watchOrderCaption } from "../../domain/anime";
import type { MediaTitle } from "../../domain/catalog";
import type { WatchOrderEntry } from "../../hooks/useWatchOrder";
import { DetailNote } from "./DetailNote";
import { TitlePair } from "./TitlePair";

import styles from "./WatchOrder.module.css";

export function WatchOrder({
  label,
  entries,
  onOpen,
}: {
  label: string;
  entries: WatchOrderEntry[];
  onOpen: (item: MediaTitle) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <DetailNote label={label} accent="none" className={styles.block}>
      {entries.map((entry) => (
        <TitlePair
          key={entry.item.id}
          item={entry.item}
          caption={watchOrderCaption(entry.relation, entry.item)}
          onOpen={onOpen}
        />
      ))}
    </DetailNote>
  );
}

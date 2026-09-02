import type { MediaTitle } from "../../domain/catalog";
import { classNames } from "../../lib/class-names";
import { TitleArt } from "../TitleArt";

import styles from "./TourTitles.module.css";

export function TourTitles({
  items,
  onOpen,
  marked,
  limit = 6,
}: {
  items: MediaTitle[];
  onOpen: (item: MediaTitle) => void;
  marked?: Set<string>;
  limit?: number;
}) {
  return (
    <ol className={styles.list}>
      {items.slice(0, limit).map((item, index) => (
        <li key={item.id}>
          <button
            type="button"
            className={classNames(styles.row, marked?.has(item.id) && styles.marked)}
            onClick={() => onOpen(item)}
          >
            <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.art}>
              <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
            </span>
            <span className={styles.copy}>
              <strong>{item.title}</strong>
              <small>
                {item.year ?? "—"} · {item.mediaType === "tv" ? "Series" : "Film"}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

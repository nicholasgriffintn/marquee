import type { MediaTitle } from "../../domain/catalog";
import { ArrowIcon } from "../../ui";
import { TitleArt } from "../TitleArt";

import styles from "./TitlePair.module.css";

export function TitlePair({
  item,
  caption,
  onOpen,
}: {
  item: MediaTitle;
  caption: string;
  onOpen: (item: MediaTitle) => void;
}) {
  return (
    <button type="button" className={styles.pair} onClick={() => onOpen(item)}>
      <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
      <span className={styles.copy}>
        <strong>{item.title}</strong>
        <small>{caption}</small>
      </span>
      <ArrowIcon />
    </button>
  );
}

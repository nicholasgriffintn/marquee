import { Link } from "react-router-dom";

import { titlePath, type MediaTitle } from "../../domain/catalog";
import { isModifiedClick } from "../../lib/navigation";
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
    <Link
      to={titlePath(item)}
      className={styles.pair}
      onClick={(event) => {
        if (isModifiedClick(event)) {
          return;
        }

        event.preventDefault();
        onOpen(item);
      }}
    >
      <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
      <span className={styles.copy}>
        <strong>{item.title}</strong>
        <small>{caption}</small>
      </span>
      <ArrowIcon />
    </Link>
  );
}

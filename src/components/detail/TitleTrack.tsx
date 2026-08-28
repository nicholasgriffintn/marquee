import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { titlePath, type MediaTitle } from "../../domain/catalog";
import { classNames } from "../../lib/class-names";
import { mediaMeta } from "../../lib/media";
import { isModifiedClick } from "../../lib/navigation";
import { Eyebrow } from "../../ui";
import { TitleArt } from "../TitleArt";

import styles from "./TitleTrack.module.css";

export function TitleTrack({
  label,
  items,
  currentId,
  caption,
  onOpen,
  footer,
}: {
  label: string;
  items: MediaTitle[];
  currentId?: string;
  caption: (item: MediaTitle) => string;
  onOpen: (item: MediaTitle) => void;
  footer?: ReactNode;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.track}>
      <Eyebrow
        size="sm"
        weight="heavy"
        tone="inkMuted"
        className={classNames(styles.label, Boolean(footer) && styles.labelRow)}
      >
        {label}
        {footer}
      </Eyebrow>
      <div className={styles.strip}>
        {items.map((item) => (
          <Link
            key={item.id}
            to={titlePath(item)}
            className={classNames(styles.card, item.id === currentId && styles.current)}
            onClick={(event) => {
              if (isModifiedClick(event)) {
                return;
              }

              event.preventDefault();
              onOpen(item);
            }}
          >
            <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
            <strong>{item.title}</strong>
            <small>{caption(item)}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function collectionCaption(item: MediaTitle) {
  return item.year ? String(item.year) : "—";
}

export function similarCaption(item: MediaTitle) {
  return mediaMeta(item);
}

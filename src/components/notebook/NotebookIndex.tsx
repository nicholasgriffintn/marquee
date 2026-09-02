import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import type { NotebookDivider } from "../../domain/notebook";
import { classNames } from "../../lib/class-names";

import styles from "./NotebookIndex.module.css";

export function NotebookIndex({
  dividers,
  current,
}: {
  dividers: NotebookDivider[];
  current: string;
}) {
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current
      ?.querySelector(`a[href$="#${current}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <nav className={styles.index} aria-label="Notebook contents">
      <p className={styles.head} aria-hidden="true">
        Contents
      </p>
      <ol className={styles.list} ref={list}>
        {dividers.map((divider, index) => (
          <li key={divider.id} className={classNames(current === divider.id && styles.active)}>
            <Link
              to={`#${divider.id}`}
              className={styles.link}
              aria-current={current === divider.id ? "page" : undefined}
            >
              <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
              <span>
                <strong>{divider.label}</strong>
                <small>{divider.aside}</small>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

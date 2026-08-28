import { useEffect, useState } from "react";

import { classNames } from "../../lib/class-names";

import styles from "./NotebookIndex.module.css";

export type Divider = { id: string; label: string; aside: string };

export function NotebookIndex({ dividers }: { dividers: Divider[] }) {
  const [active, setActive] = useState(dividers[0]?.id ?? "");

  useEffect(() => {
    const sections = dividers
      .map((divider) => document.getElementById(divider.id))
      .filter((element): element is HTMLElement => element !== null);

    if (sections.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .toSorted((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];

        if (visible) {
          setActive(visible.target.id);
        }
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [dividers]);

  return (
    <nav className={styles.index} aria-label="Notebook contents">
      <p className={styles.head} aria-hidden="true">
        Contents
      </p>
      <ol className={styles.list}>
        {dividers.map((divider, index) => (
          <li key={divider.id} className={classNames(active === divider.id && styles.active)}>
            <a href={`#${divider.id}`} className={styles.link}>
              <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
              <span>
                <strong>{divider.label}</strong>
                <small>{divider.aside}</small>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

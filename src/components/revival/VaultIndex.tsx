import { Link } from "react-router-dom";

import {
  hubPath,
  REVIVAL_TERM_PATH,
  type HubFamily,
  type RevivalGroup,
  type RevivalHubs,
} from "../../domain/revival";
import { Eyebrow, Heading, Text } from "../../ui";

import styles from "./VaultIndex.module.css";

type Column = {
  family: HubFamily;
  title: string;
  items: RevivalGroup[];
  label: (group: RevivalGroup) => string;
};

const plain = (group: RevivalGroup) => group.label;

export function VaultIndex({
  hubs,
  current,
}: {
  hubs: RevivalHubs | null;
  current?: { family: string; slug: string };
}) {
  if (!hubs) {
    return null;
  }

  const all: Column[] = [
    { family: "decade", title: "By decade", items: hubs.decades, label: (g) => `${g.label}s` },
    { family: "director", title: "By director", items: hubs.directors, label: plain },
    { family: "genre", title: "By genre", items: hubs.genres, label: plain },
  ];
  const columns = all.filter((column) => column.items.length > 0);

  if (columns.length === 0) {
    return null;
  }

  return (
    <section className={styles.index} aria-labelledby="vault-index-title">
      <Heading level={2} size="label" tone="muted" id="vault-index-title" className={styles.head}>
        The vault, shelf by shelf
      </Heading>
      <div className={styles.columns}>
        {columns.map((column) => (
          <div key={column.family} className={styles.column}>
            <Eyebrow as="p" size="sm" tone="accent">
              {column.title}
            </Eyebrow>
            <ul>
              {column.items.map((group) => {
                const isCurrent = current?.family === column.family && current.slug === group.slug;

                return (
                  <li key={group.slug}>
                    <Link
                      to={hubPath(column.family, group.slug)}
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      {column.label(group)}
                    </Link>
                    <small>{group.size.toLocaleString()}</small>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <Text size="sm" tone="muted" className={styles.term}>
        <Link to={REVIVAL_TERM_PATH}>Why a print can be free here and not there.</Link>
      </Text>
    </section>
  );
}

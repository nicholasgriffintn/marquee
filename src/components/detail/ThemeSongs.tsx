import { useState } from "react";

import type { AnimeTheme, MediaTitle } from "../../domain/catalog";
import { ChevronIcon } from "../../ui";
import { DetailCredit } from "./DetailNote";

import styles from "./DetailList.module.css";

const SHOWN = 3;

function ThemeList({ label, songs }: { label: string; songs: AnimeTheme[] }) {
  const [showAll, setShowAll] = useState(false);
  const held = songs.length - SHOWN;
  const visible = showAll ? songs : songs.slice(0, SHOWN);

  return (
    <div className={styles.group}>
      <span className={styles.groupLabel}>{label}</span>
      <ol className={styles.list}>
        {visible.map((song, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- AnimeTheme has no stable id, list order is API-fixed
          <li key={`${song.title}-${index}`}>
            <b>{song.title}</b>
            {song.artist ? <i>{song.artist}</i> : null}
            {song.episodes ? <small>eps {song.episodes}</small> : null}
          </li>
        ))}
      </ol>
      {held > 0 && !showAll && (
        <button type="button" className={styles.more} onClick={() => setShowAll(true)}>
          Show {held} more
          <ChevronIcon />
        </button>
      )}
    </div>
  );
}

export function ThemeSongs({ item }: { item: MediaTitle }) {
  const openings = item.anime?.openings ?? [];
  const endings = item.anime?.endings ?? [];

  if (openings.length === 0 && endings.length === 0) {
    return null;
  }

  return (
    <section className={styles.block} aria-label="Opening and ending themes">
      {openings.length > 0 && <ThemeList label="Openings" songs={openings} />}
      {endings.length > 0 && <ThemeList label="Endings" songs={endings} />}
      <DetailCredit>Themes from MyAnimeList</DetailCredit>
    </section>
  );
}

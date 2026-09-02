import { UPSTREAM_SOURCES, UPSTREAM_SOURCE_IDS } from "../../domain/sources";
import { useBuilding } from "../../hooks/useBuilding";
import { useCountUp } from "../../hooks/useCountUp";
import { Callout, Skeleton } from "../../ui";

import styles from "./BoothStop.module.css";

const SKELETON_TILES = [0, 1, 2, 3, 4, 5];

function Counter({
  label,
  value,
  note,
  isRunning,
}: {
  label: string;
  value: number;
  note: string;
  isRunning: boolean;
}) {
  const shown = useCountUp(value, isRunning);

  return (
    <div className={styles.counter}>
      <strong>{shown.toLocaleString()}</strong>
      <span>{label}</span>
      <em>{note}</em>
    </div>
  );
}

export function BoothStop({ isActive }: { isActive: boolean }) {
  const { counts, error, isLoading } = useBuilding(isActive);

  return (
    <div className={styles.booth}>
      <aside className={styles.note}>
        <p className={styles.noteHead}>Pinned to the door</p>
        <p className={styles.noteBody}>Back in ten minutes.</p>
        <p className={styles.noteFoot}>Undated. We have not spoken since 1988. — The Usher</p>
      </aside>

      <div className={styles.readout}>
        {error && <Callout>{error}</Callout>}

        {counts ? (
          <div className={styles.counters}>
            <Counter
              label="Titles"
              value={counts.titles}
              note={`${counts.movies.toLocaleString()} films, ${counts.shows.toLocaleString()} series`}
              isRunning={isActive}
            />
            <Counter
              label="Vectors"
              value={counts.embeddings}
              note="bge-m3, keyed on a content hash"
              isRunning={isActive}
            />
            <Counter
              label="Names on the credits"
              value={counts.people}
              note={`across ${counts.seasons.toLocaleString()} seasons`}
              isRunning={isActive}
            />
            <Counter
              label="Prints cleared"
              value={counts.prints}
              note={`${counts.printsMirrored.toLocaleString()} copied into our own room`}
              isRunning={isActive}
            />
            <Counter
              label="Cinemas placed"
              value={counts.cinemas}
              note={`${counts.screenings.toLocaleString()} showings on the books`}
              isRunning={isActive}
            />
            <Counter
              label="Episodes due"
              value={counts.upcoming}
              note="dated, and waiting to be told about"
              isRunning={isActive}
            />
          </div>
        ) : (
          <div className={styles.counters} aria-hidden="true">
            {SKELETON_TILES.map((tile) => (
              <Skeleton key={tile} className={styles.tileSkeleton} />
            ))}
          </div>
        )}

        {!isLoading && (
          <div className={styles.sources}>
            <p className={styles.sourcesHead}>Who he rings, and what for</p>
            <ul className={styles.sourcesList}>
              {UPSTREAM_SOURCE_IDS.map((id) => (
                <li key={id}>
                  <strong>{UPSTREAM_SOURCES[id].label}</strong>
                  <span>{UPSTREAM_SOURCES[id].powers}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

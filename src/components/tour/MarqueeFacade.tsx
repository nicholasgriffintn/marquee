import type { MediaTitle } from "../../domain/catalog";
import { classNames } from "../../lib/class-names";

import styles from "./MarqueeFacade.module.css";

const BOARD_LINES = 3;
const LINE_LENGTH = 22;
const CANOPY_BULBS = Array.from({ length: 13 }, (_, index) => index);
const DEAD_BULB = 8;
const DOORS = [0, 1, 2];
const WINDOWS = [0, 1];

function boardLine(title: string) {
  const shouted = title.toUpperCase();

  return shouted.length > LINE_LENGTH ? `${shouted.slice(0, LINE_LENGTH - 1)}…` : shouted;
}

function BulbRow({ lit }: { lit: boolean }) {
  return (
    <div className={styles.bulbs} aria-hidden="true">
      {CANOPY_BULBS.map((bulb) => (
        <i key={bulb} className={classNames(lit && bulb === DEAD_BULB && styles.dead)} />
      ))}
    </div>
  );
}

export function MarqueeFacade({ showing }: { showing: MediaTitle[] }) {
  const lines = showing.slice(0, BOARD_LINES);

  return (
    <div className={styles.facade}>
      <div className={styles.upper} aria-hidden="true">
        <div className={styles.cornice} />
        <div className={styles.windows}>
          {WINDOWS.map((window) => (
            <i key={window} />
          ))}
        </div>
      </div>

      <div className={styles.blade} aria-hidden="true">
        <span>MARQUEE</span>
      </div>

      <div className={styles.canopy}>
        <BulbRow lit />

        <div className={styles.board}>
          <p className={styles.boardHead}>
            <span>Now showing</span>
            <span>Adm. one</span>
          </p>

          {lines.length > 0 ? (
            <ol className={styles.lines}>
              {lines.map((item) => (
                <li key={item.id}>{boardLine(item.title)}</li>
              ))}
            </ol>
          ) : (
            <ol className={styles.lines} aria-hidden="true">
              <li className={styles.blank} />
              <li className={styles.blank} />
              <li className={styles.blank} />
            </ol>
          )}
        </div>

        <BulbRow lit={false} />
      </div>

      <div className={styles.front} aria-hidden="true">
        <div className={styles.stripe} />
        <div className={styles.doors}>
          {DOORS.map((door) => (
            <i key={door} />
          ))}
        </div>
      </div>
    </div>
  );
}

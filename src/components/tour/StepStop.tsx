import { DEFAULT_FACADE, FACADE_OPTIONS, isFacadeId } from "../../domain/facades";
import { memberTally } from "../../domain/screening";
import { useBuilding } from "../../hooks/useBuilding";
import { useCountUp } from "../../hooks/useCountUp";
import { useNowShowing } from "../../hooks/useNowShowing";
import { useScreeningRoom } from "../screening/ScreeningContext";
import { CinemaFacade } from "./facades/CinemaFacade";

import styles from "./StepStop.module.css";

function leadingChoice(tally: Record<string, number>) {
  const [leader] = Object.entries(tally).toSorted(([, left], [, right]) => right - left);

  return leader && leader[1] > 0 ? leader[0] : null;
}

export function StepStop({ isActive, onBegin }: { isActive: boolean; onBegin: () => void }) {
  const { counts } = useBuilding(true);
  const titles = useCountUp(counts?.titles ?? 0, isActive);
  const showing = useNowShowing(true);
  const screening = useScreeningRoom();
  const room = screening?.room ?? null;
  const tally = room ? memberTally(room.definition, room.members) : null;
  const chosen = screening?.you?.choice ?? (tally ? leadingChoice(tally) : null);
  const facadeId = isFacadeId(chosen) ? chosen : DEFAULT_FACADE;
  const facade = FACADE_OPTIONS.find((option) => option.id === facadeId) ?? FACADE_OPTIONS[0];

  return (
    <div className={styles.step}>
      <div className={styles.copy}>
        <p className={styles.tally}>
          <strong>{titles.toLocaleString()}</strong>
          <span>titles in the building tonight, and no building</span>
        </p>

        <button type="button" className={styles.begin} onClick={onBegin}>
          Come on then
        </button>

        <p className={styles.keys}>
          Arrow keys walk you through it. <kbd>P</kbd> puts the lights down.
        </p>
      </div>

      <div className={styles.building}>
        <CinemaFacade id={facadeId} showing={showing} />
        <p className={styles.plate}>
          <span>{screening?.you ? `Your cinema · ${facade.label}` : facade.label}</span>
          <em>
            {room && tally
              ? `${room.members.length} tickets sold · ${tally[facadeId] ?? 0} here`
              : "Ext. after the last showing"}
          </em>
        </p>
      </div>
    </div>
  );
}

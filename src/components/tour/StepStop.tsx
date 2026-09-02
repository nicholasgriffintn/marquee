import { useBuilding } from "../../hooks/useBuilding";
import { useCountUp } from "../../hooks/useCountUp";
import { useNowShowing } from "../../hooks/useNowShowing";
import { MarqueeFacade } from "./MarqueeFacade";

import styles from "./StepStop.module.css";

export function StepStop({ isActive, onBegin }: { isActive: boolean; onBegin: () => void }) {
  const { counts } = useBuilding(true);
  const titles = useCountUp(counts?.titles ?? 0, isActive);
  const showing = useNowShowing(true);

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
        <MarqueeFacade showing={showing} />
      </div>
    </div>
  );
}

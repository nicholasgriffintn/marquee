import { TOUR_STOPS } from "../../domain/tour";
import { classNames } from "../../lib/class-names";
import { useScreeningRoom } from "../screening/ScreeningContext";

import styles from "./TourRail.module.css";

export function TourRail({
  activeIndex,
  isPresenting,
  canOpenDoors,
  onOpenDoors,
  onGoTo,
  onPresent,
}: {
  activeIndex: number;
  isPresenting: boolean;
  canOpenDoors: boolean;
  onOpenDoors: () => void;
  onGoTo: (index: number) => void;
  onPresent: () => void;
}) {
  const next = TOUR_STOPS[activeIndex + 1];
  const screening = useScreeningRoom();
  const crowd = new Map<string, number>();

  for (const member of screening?.room?.members ?? []) {
    if (member.online && member.stage && member.key !== screening?.room?.you) {
      crowd.set(member.stage, (crowd.get(member.stage) ?? 0) + 1);
    }
  }

  return (
    <div className={classNames(styles.rail, isPresenting && styles.presenting)}>
      <nav className={styles.stops} aria-label="Tour stops">
        {TOUR_STOPS.map((stop, index) => (
          <button
            key={stop.id}
            type="button"
            className={classNames(styles.pip, index === activeIndex && styles.here)}
            aria-current={index === activeIndex ? "step" : undefined}
            onClick={() => onGoTo(index)}
          >
            <span>{stop.name}</span>
            {crowd.has(stop.id) && <em className={styles.crowd}>{crowd.get(stop.id)}</em>}
          </button>
        ))}
      </nav>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => onGoTo(activeIndex - 1)}
          disabled={activeIndex === 0}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={() => onGoTo(activeIndex + 1)}
          disabled={!next}
        >
          Next
        </button>

        <p className={styles.next}>
          {next ? (
            <>
              <span>Next</span>
              {next.name}
            </>
          ) : (
            <>
              <span>Last one</span>
              Way out
            </>
          )}
        </p>

        <button
          type="button"
          className={classNames(styles.control, styles.present)}
          onClick={onPresent}
          aria-pressed={isPresenting}
        >
          {isPresenting ? "Lights up" : "Lights down"}
        </button>

        {canOpenDoors && (
          <button
            type="button"
            className={classNames(styles.control, styles.doors)}
            onClick={onOpenDoors}
          >
            Open the doors
          </button>
        )}
      </div>
    </div>
  );
}

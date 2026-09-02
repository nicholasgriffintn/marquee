import { TOUR_STOPS } from "../../domain/tour";
import { classNames } from "../../lib/class-names";

import styles from "./TourRail.module.css";

export function TourRail({
  activeIndex,
  isPresenting,
  onGoTo,
  onPresent,
}: {
  activeIndex: number;
  isPresenting: boolean;
  onGoTo: (index: number) => void;
  onPresent: () => void;
}) {
  const next = TOUR_STOPS[activeIndex + 1];

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
      </div>
    </div>
  );
}

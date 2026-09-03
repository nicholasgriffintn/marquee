import { useEffect, useRef } from "react";

import { trailerStill, type TrailerCard } from "../../domain/trailers";
import { classNames } from "../../lib/class-names";
import { formatDaysAgo } from "../../lib/dates";
import { compactCount } from "../../lib/media";
import { Rail, RailHeading, RailTrack } from "../rail/Rail";

import styles from "./TrailerReel.module.css";

const TRACK_GAP = 13;

function revealActiveItem(track: HTMLDivElement, key: string) {
  const item = track.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);

  if (!item) {
    return;
  }

  const left =
    item.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
  const visible =
    left >= track.scrollLeft && left + item.offsetWidth <= track.scrollLeft + track.clientWidth;

  if (!visible) {
    track.scrollTo({ left: Math.max(0, left - TRACK_GAP), behavior: "smooth" });
  }
}

function ReelItem({
  trailer,
  active,
  onSelect,
}: {
  trailer: TrailerCard;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={classNames(styles.item, active && styles.active)}
      data-key={trailer.key}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className={styles.still}>
        <img src={trailerStill(trailer.key)} alt="" loading="lazy" decoding="async" />
        {active && <span className={styles.now}>Now showing</span>}
      </span>
      <strong className={styles.title}>{trailer.item.title}</strong>
      <span className={styles.facts}>
        <b>{formatDaysAgo(trailer.publishedAt)}</b>
        {trailer.views ? <em>{compactCount(trailer.views)} views</em> : null}
      </span>
    </button>
  );
}

export function TrailerReel({
  trailers,
  activeKey,
  onSelect,
}: {
  trailers: TrailerCard[];
  activeKey: string;
  onSelect: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trackRef.current) {
      revealActiveItem(trackRef.current, activeKey);
    }
  }, [activeKey]);

  return (
    <Rail bleed={false}>
      <RailHeading bleed={false} eyebrow="On the reel" heading="Up next" />
      <RailTrack bleed={false} trackRef={trackRef} className={styles.track}>
        {trailers.map((trailer, index) => (
          <ReelItem
            key={`${trailer.item.id}:${trailer.key}`}
            trailer={trailer}
            active={trailer.key === activeKey}
            onSelect={() => onSelect(index)}
          />
        ))}
      </RailTrack>
    </Rail>
  );
}

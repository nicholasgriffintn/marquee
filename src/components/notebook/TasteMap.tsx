import { memo, useCallback, useEffect, useMemo, useState } from "react";

import type { MapNeighbour, MapPoint, TasteMapResponse } from "../../domain/notebook";
import { classNames } from "../../lib/class-names";
import { queryJson } from "../../lib/query-client";
import { ArrowIcon } from "../../ui";
import { NotebookEmpty } from "./NotebookSection";
import { TasteMapCard } from "./TasteMapCard";

import styles from "./TasteMap.module.css";
import cardStyles from "./TasteMapCard.module.css";

const SIZE = 560;
const PAD = 34;
const ART_SETTLE = 130;

function radius(weight: number) {
  return 5 + Math.min(7, Math.abs(weight) * 5);
}

function pointLabel(point: MapPoint) {
  const landed = point.weight >= 0 ? "landed with you" : "did not land";

  return `${point.title}${point.year ? ` (${point.year})` : ""} — ${point.genre} — ${landed}`;
}

type PointHandlers = {
  onEnter: (point: MapPoint) => void;
  onLeave: () => void;
  onPick: (point: MapPoint) => void;
  onClear: () => void;
};

const TastePoint = memo(function TastePoint({
  point,
  cx,
  cy,
  active,
  pinned,
  handlers,
}: {
  point: MapPoint;
  cx: number;
  cy: number;
  active: boolean;
  pinned: boolean;
  handlers: PointHandlers;
}) {
  const size = radius(point.weight);

  return (
    <g
      className={classNames(
        styles.point,
        point.weight >= 0 ? styles.liked : styles.cooled,
        active && styles.active,
      )}
      tabIndex={0}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- svg <g> point, a native button can't render inside svg
      role="button"
      aria-label={pointLabel(point)}
      aria-pressed={pinned}
      onMouseEnter={() => handlers.onEnter(point)}
      onMouseLeave={handlers.onLeave}
      onFocus={() => handlers.onEnter(point)}
      onBlur={handlers.onLeave}
      onClick={() => handlers.onPick(point)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlers.onPick(point);
        }

        if (event.key === "Escape") {
          handlers.onClear();
        }
      }}
    >
      <circle cx={cx} cy={cy} r={size + 8} className={styles.hit} />
      <circle cx={cx} cy={cy} r={size} />
    </g>
  );
});

function MapSummary({ map, landed }: { map: TasteMapResponse; landed: number }) {
  const axes = map.axes;

  return (
    <div className={classNames(cardStyles.card, cardStyles.blank)}>
      <p className={cardStyles.hint}>
        Hover a mark, or tab to one, and I will tell you what it is.
      </p>

      <dl className={cardStyles.facts}>
        <div>
          <dt>On this table</dt>
          <dd>
            {landed} landed with you, {map.mappedCount - landed} did not
          </dd>
        </div>
        {axes.x && (
          <div>
            <dt>Left to right</dt>
            <dd>
              <span className={cardStyles.range}>
                {axes.x.low} <ArrowIcon /> {axes.x.high}
              </span>
            </dd>
          </div>
        )}
        {axes.y && (
          <div>
            <dt>Bottom to top</dt>
            <dd>
              <span className={cardStyles.range}>
                {axes.y.low} <ArrowIcon /> {axes.y.high}
              </span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function TasteMap({ isSignedIn }: { isSignedIn: boolean }) {
  const [map, setMap] = useState<TasteMapResponse | null>(null);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [pinned, setPinned] = useState<MapPoint | null>(null);
  const [artId, setArtId] = useState("");
  const [pickSignal, setPickSignal] = useState(0);

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    let active = true;

    async function load() {
      try {
        const response = await queryJson<TasteMapResponse>("/api/notebook/map");

        if (active) {
          setMap(response);
          setError("");
        }
      } catch {
        if (active) {
          setError("I cannot lay the map out just now. Try again shortly.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [isSignedIn]);

  const active = hovered ?? pinned;
  const activeId = active?.titleId ?? "";

  useEffect(() => {
    if (!activeId || activeId === artId) {
      return undefined;
    }

    const timer = setTimeout(() => setArtId(activeId), ART_SETTLE);

    return () => clearTimeout(timer);
  }, [activeId, artId]);

  const points = map?.points;

  const byTitleId = useMemo(
    () => new Map((points ?? []).map((point) => [point.titleId, point])),
    [points],
  );

  const landed = useMemo(
    () => (points ?? []).filter((point) => point.weight >= 0).length,
    [points],
  );

  const plotted = points ?? [];

  const placed = useMemo(() => {
    const plot = SIZE - PAD * 2;

    return new Map(
      (points ?? []).map((point) => [
        point.titleId,
        { cx: PAD + point.x * plot, cy: SIZE - PAD - point.y * plot },
      ]),
    );
  }, [points]);

  const threads = useMemo(() => {
    const from = activeId ? placed.get(activeId) : undefined;
    const point = activeId ? byTitleId.get(activeId) : undefined;

    if (!from || !point) {
      return [];
    }

    return point.neighbours.flatMap((neighbour) => {
      const to = placed.get(neighbour.titleId);

      return to ? [{ titleId: neighbour.titleId, from, to }] : [];
    });
  }, [activeId, byTitleId, placed]);

  const handlers = useMemo<PointHandlers>(
    () => ({
      onEnter: (point) => setHovered(point),
      onLeave: () => setHovered(null),
      onPick: (point) => setPinned(point),
      onClear: () => setPinned(null),
    }),
    [],
  );

  const pickNeighbour = useCallback(
    (neighbour: MapNeighbour) => {
      const point = byTitleId.get(neighbour.titleId);

      if (point) {
        setHovered(null);
        setPinned(point);
        setPickSignal((current) => current + 1);
      }
    },
    [byTitleId],
  );

  if (!isSignedIn) {
    return null;
  }

  if (error) {
    return <NotebookEmpty>{error}</NotebookEmpty>;
  }

  if (map === null) {
    return <NotebookEmpty>Finding a flat enough table…</NotebookEmpty>;
  }

  if (map.status === "sparse") {
    return (
      <NotebookEmpty>
        Not enough on the shelf to draw it yet — I need four things you have marked, and I have{" "}
        {map.shelfCount}. Rate a few more and I will map them.
      </NotebookEmpty>
    );
  }

  if (map.status === "pending") {
    return (
      <NotebookEmpty>
        I have {map.shelfCount} on your shelf but I have only read {map.mappedCount} of them
        properly. I am reading the rest now — come back in a minute and the map will be here.
      </NotebookEmpty>
    );
  }

  const axes = map.axes;

  return (
    <div>
      <div className={styles.frame}>
        <div className={styles.readout}>
          {active ? (
            <TasteMapCard
              point={active}
              axes={axes}
              artReady={artId === active.titleId}
              onPick={pickNeighbour}
              focusSignal={pickSignal}
            />
          ) : (
            <MapSummary map={map} landed={landed} />
          )}
        </div>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- groups an svg chart, no semantic tag fits an svg container
          role="group"
          aria-label="Your shelf, laid out so that alike things sit together"
        >
          <rect
            x="0"
            y="0"
            width={SIZE}
            height={SIZE}
            className={styles.ground}
            onClick={() => setPinned(null)}
          />

          {axes.x && (
            <>
              <text className={styles.axis} x={PAD} y={SIZE - 10} textAnchor="start">
                {axes.x.low}
              </text>
              <text className={styles.axis} x={SIZE - PAD} y={SIZE - 10} textAnchor="end">
                {axes.x.high}
              </text>
            </>
          )}

          {axes.y && (
            <>
              <text
                className={styles.axis}
                x={14}
                y={SIZE - PAD}
                textAnchor="start"
                transform={`rotate(-90 14 ${SIZE - PAD})`}
              >
                {axes.y.low}
              </text>
              <text
                className={styles.axis}
                x={14}
                y={PAD}
                textAnchor="end"
                transform={`rotate(-90 14 ${PAD})`}
              >
                {axes.y.high}
              </text>
            </>
          )}

          {threads.map((thread) => (
            <line
              key={thread.titleId}
              className={styles.thread}
              x1={thread.from.cx}
              y1={thread.from.cy}
              x2={thread.to.cx}
              y2={thread.to.cy}
            />
          ))}

          {plotted.map((point) => {
            const spot = placed.get(point.titleId);

            return (
              <TastePoint
                key={point.titleId}
                point={point}
                cx={spot?.cx ?? 0}
                cy={spot?.cy ?? 0}
                active={activeId === point.titleId}
                pinned={pinned?.titleId === point.titleId}
                handlers={handlers}
              />
            );
          })}
        </svg>
      </div>

      <ul className={styles.key}>
        <li className={styles.keyLiked}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
          </svg>
          Landed with you
        </li>
        <li className={styles.keyCooled}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
          </svg>
          Did not
        </li>
        <li>Bigger means stronger feelings either way</li>
        <li>
          {map.mappedCount} of {map.shelfCount} marks placed
        </li>
      </ul>
    </div>
  );
}

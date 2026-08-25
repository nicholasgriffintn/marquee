import { memo, useCallback, useEffect, useMemo, useState } from "react";

import type { MapNeighbour, MapPoint, TasteMapResponse } from "../../domain/notebook";
import { isAbortError, requestJson } from "../../lib/api";
import { TasteMapCard } from "./TasteMapCard";

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
      className={`taste-point${point.weight >= 0 ? " liked" : " cooled"}${active ? " active" : ""}`}
      tabIndex={0}
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
      <circle cx={cx} cy={cy} r={size + 8} className="taste-point-hit" />
      <circle cx={cx} cy={cy} r={size} />
    </g>
  );
});

function MapSummary({ map, landed }: { map: TasteMapResponse; landed: number }) {
  const axes = map.axes;

  return (
    <div className="taste-card taste-card-blank">
      <p className="taste-card-hint">
        Hover a mark, or tab to one, and I will tell you what it is.
      </p>

      <dl className="taste-card-facts">
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
              {axes.x.low} → {axes.x.high}
            </dd>
          </div>
        )}
        {axes.y && (
          <div>
            <dt>Bottom to top</dt>
            <dd>
              {axes.y.low} → {axes.y.high}
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

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<TasteMapResponse>("/api/notebook/map", {
          signal: controller.signal,
        });

        setMap(response);
        setError("");
      } catch (caught) {
        if (isAbortError(caught)) {
          return;
        }

        setError("I cannot lay the map out just now. Try again shortly.");
      }
    }

    void load();

    return () => controller.abort();
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
      }
    },
    [byTitleId],
  );

  if (!isSignedIn) {
    return null;
  }

  if (error) {
    return (
      <p className="notebook-empty" role="alert">
        {error}
      </p>
    );
  }

  if (map === null) {
    return <p className="notebook-empty">Finding a flat enough table…</p>;
  }

  if (map.status === "sparse") {
    return (
      <p className="notebook-empty">
        Not enough on the shelf to draw it yet — I need four things you have marked, and I have{" "}
        {map.shelfCount}. Rate a few more and I will map them.
      </p>
    );
  }

  if (map.status === "pending") {
    return (
      <p className="notebook-empty">
        I have {map.shelfCount} on your shelf but I have only read {map.mappedCount} of them
        properly. I am reading the rest now — come back in a minute and the map will be here.
      </p>
    );
  }

  const axes = map.axes;

  return (
    <div className="taste-map">
      <div className="taste-map-frame">
        {/* Comes before the svg in source order so a screen reader reaches "hover a
            mark, or tab to one" before the interactive points themselves; CSS order
            keeps it visually on the right, where it always was. */}
        <div className="taste-map-readout">
          {active ? (
            <TasteMapCard
              point={active}
              axes={axes}
              artReady={artId === active.titleId}
              onPick={pickNeighbour}
            />
          ) : (
            <MapSummary map={map} landed={landed} />
          )}
        </div>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="group"
          aria-label="Your shelf, laid out so that alike things sit together"
        >
          <rect
            x="0"
            y="0"
            width={SIZE}
            height={SIZE}
            className="taste-map-ground"
            onClick={() => setPinned(null)}
          />

          {axes.x && (
            <>
              <text className="taste-map-axis" x={PAD} y={SIZE - 10} textAnchor="start">
                ← {axes.x.low}
              </text>
              <text className="taste-map-axis" x={SIZE - PAD} y={SIZE - 10} textAnchor="end">
                {axes.x.high} →
              </text>
            </>
          )}

          {axes.y && (
            <>
              <text
                className="taste-map-axis"
                x={14}
                y={SIZE - PAD}
                textAnchor="start"
                transform={`rotate(-90 14 ${SIZE - PAD})`}
              >
                ← {axes.y.low}
              </text>
              <text
                className="taste-map-axis"
                x={14}
                y={PAD}
                textAnchor="end"
                transform={`rotate(-90 14 ${PAD})`}
              >
                {axes.y.high} →
              </text>
            </>
          )}

          {threads.map((thread) => (
            <line
              key={thread.titleId}
              className="taste-thread"
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

      <ul className="taste-map-key">
        <li className="liked">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
          </svg>
          Landed with you
        </li>
        <li className="cooled">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
          </svg>
          Did not
        </li>
        <li className="sized">Bigger means stronger feelings either way</li>
        <li className="sized">
          {map.mappedCount} of {map.shelfCount} marks placed
        </li>
      </ul>
    </div>
  );
}

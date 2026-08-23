import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { titlePath, type MediaType } from "../../domain/catalog";
import { requestJson } from "../../lib/api";

type MapPoint = {
  titleId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  tmdbId: number;
  genre: string;
  weight: number;
  x: number;
  y: number;
  nearest: string | null;
};

type MapAxis = { low: string; high: string } | null;

type TasteMapResponse = {
  status: "ready" | "sparse" | "pending";
  points: MapPoint[];
  shelfCount: number;
  mappedCount: number;
  axes: { x: MapAxis; y: MapAxis };
};

const SIZE = 560;
const PAD = 34;

function radius(weight: number) {
  return 5 + Math.min(7, Math.abs(weight) * 5);
}

function pointLabel(point: MapPoint) {
  const landed = point.weight >= 0 ? "landed with you" : "did not land";

  return `${point.title}${point.year ? ` (${point.year})` : ""} — ${point.genre} — ${landed}`;
}

export function TasteMap({ isSignedIn }: { isSignedIn: boolean }) {
  const [map, setMap] = useState<TasteMapResponse | null>(null);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [pinned, setPinned] = useState<MapPoint | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      return;
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
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError("I cannot lay the map out just now. Try again shortly.");
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn]);

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

  const plot = SIZE - PAD * 2;
  const active = hovered ?? pinned;
  const axes = map.axes;

  return (
    <div className="taste-map">
      <div className="taste-map-frame">
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

          {map.points.map((point) => {
            const cx = PAD + point.x * plot;
            const cy = SIZE - PAD - point.y * plot;
            const liked = point.weight >= 0;

            return (
              <g
                key={point.titleId}
                className={`taste-point${liked ? " liked" : " cooled"}${
                  active?.titleId === point.titleId ? " active" : ""
                }`}
                tabIndex={0}
                role="button"
                aria-label={pointLabel(point)}
                aria-pressed={pinned?.titleId === point.titleId}
                onMouseEnter={() => setHovered(point)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(point)}
                onBlur={() => setHovered(null)}
                onClick={() => setPinned(point)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPinned(point);
                  }

                  if (event.key === "Escape") {
                    setPinned(null);
                  }
                }}
              >
                <circle cx={cx} cy={cy} r={radius(point.weight) + 8} className="taste-point-hit" />
                <circle cx={cx} cy={cy} r={radius(point.weight)} />
              </g>
            );
          })}
        </svg>

        <div className="taste-map-readout" aria-live="polite">
          {active ? (
            <>
              <strong>{active.title}</strong>
              <span>
                {active.genre}
                {active.year ? ` · ${active.year}` : ""}
              </span>
              <em>{active.weight >= 0 ? "landed" : "did not land"}</em>
              {active.nearest && (
                <span className="taste-map-nearest">
                  Nearest thing on your shelf: {active.nearest}
                </span>
              )}
              {active.tmdbId > 0 && (
                <Link className="taste-map-open" to={titlePath(active)}>
                  Open its page
                </Link>
              )}
            </>
          ) : (
            <span>Hover a mark, or tab to one, and I will tell you what it is.</span>
          )}
        </div>
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

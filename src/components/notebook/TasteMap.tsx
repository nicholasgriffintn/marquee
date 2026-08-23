import { useEffect, useState } from "react";

import { requestJson } from "../../lib/api";

type MapPoint = {
  titleId: string;
  title: string;
  genre: string;
  weight: number;
  x: number;
  y: number;
};

const SIZE = 560;
const PAD = 26;

function radius(weight: number) {
  return 5 + Math.min(7, Math.abs(weight) * 5);
}

export function TasteMap({ isSignedIn }: { isSignedIn: boolean }) {
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [hovered, setHovered] = useState<MapPoint | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    void requestJson<{ points: MapPoint[] }>("/api/notebook/map", { signal: controller.signal })
      .then((response) => setPoints(response.points))
      .catch(() => setPoints([]));

    return () => controller.abort();
  }, [isSignedIn]);

  if (!isSignedIn || points === null) {
    return null;
  }

  if (points.length < 4) {
    return (
      <div className="notebook-group">
        <h2>The shape of your taste</h2>
        <p className="notebook-lede">
          Not enough on the shelf to draw it yet. Rate a few more and I will map them.
        </p>
      </div>
    );
  }

  const plot = SIZE - PAD * 2;

  return (
    <div className="notebook-group taste-map">
      <h2>The shape of your taste</h2>
      <p className="notebook-lede">
        Every title you have marked, placed by what it is rather than what it is called. Close
        together means alike. The two directions have no names — I worked them out myself.
      </p>

      <div className="taste-map-frame">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="A map of your shelf">
          <rect x="0" y="0" width={SIZE} height={SIZE} className="taste-map-ground" />
          {points.map((point) => {
            const cx = PAD + point.x * plot;
            const cy = SIZE - PAD - point.y * plot;
            const liked = point.weight >= 0;

            return (
              <g
                key={point.titleId}
                className={`taste-point${liked ? " liked" : " cooled"}${
                  hovered?.titleId === point.titleId ? " active" : ""
                }`}
                onMouseEnter={() => setHovered(point)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>
                  {point.title} — {point.genre} — {liked ? "you liked it" : "it did not land"}
                </title>
                <circle cx={cx} cy={cy} r={radius(point.weight)} />
              </g>
            );
          })}
        </svg>

        <p className="taste-map-readout" aria-live="polite">
          {hovered ? (
            <>
              <strong>{hovered.title}</strong>
              <span>{hovered.genre}</span>
              <em>{hovered.weight >= 0 ? "landed" : "did not land"}</em>
            </>
          ) : (
            <span>Hover a mark to see what it is.</span>
          )}
        </p>
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
      </ul>
    </div>
  );
}

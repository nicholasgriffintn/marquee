import { memo, useEffect, useMemo, useState } from "react";

import { isVague, type AtlasPlace, type ShelfAtlas as Atlas } from "../../domain/places";
import { isAbortError, requestJson } from "../../lib/api";
import { meridians, parallels, project } from "../../lib/equirectangular";
import { AtlasCard, AtlasSummary } from "./AtlasCard";

const WIDTH = 720;
const HEIGHT = 360;
const EXTENT = { width: WIDTH, height: HEIGHT };
const BASE_RADIUS = 4;
const MAX_RADIUS = 11;

function radius(place: AtlasPlace) {
  return Math.min(MAX_RADIUS, BASE_RADIUS + (place.titles.length - 1) * 1.6);
}

function pinLabel(place: AtlasPlace) {
  const where = place.country && !place.isCountry ? `, ${place.country}` : "";
  const count =
    place.titles.length === 1 ? "one thing on your shelf" : `${place.titles.length} things`;

  return `${place.label}${where} — ${count} shot here`;
}

type PinHandlers = {
  onEnter: (place: AtlasPlace) => void;
  onLeave: () => void;
  onPick: (place: AtlasPlace) => void;
  onClear: () => void;
};

const AtlasPin = memo(function AtlasPin({
  place,
  cx,
  cy,
  active,
  pinned,
  handlers,
}: {
  place: AtlasPlace;
  cx: number;
  cy: number;
  active: boolean;
  pinned: boolean;
  handlers: PinHandlers;
}) {
  const size = radius(place);

  return (
    <g
      className={`atlas-pin${isVague(place) ? " vague" : " placed"}${active ? " active" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={pinLabel(place)}
      aria-pressed={pinned}
      onMouseEnter={() => handlers.onEnter(place)}
      onMouseLeave={handlers.onLeave}
      onFocus={() => handlers.onEnter(place)}
      onBlur={handlers.onLeave}
      onClick={() => handlers.onPick(place)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlers.onPick(place);
        }

        if (event.key === "Escape") {
          handlers.onClear();
        }
      }}
    >
      <circle cx={cx} cy={cy} r={size + 7} className="atlas-pin-hit" />
      <circle cx={cx} cy={cy} r={size} />
    </g>
  );
});

export function ShelfAtlas({ isSignedIn }: { isSignedIn: boolean }) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<AtlasPlace | null>(null);
  const [pinned, setPinned] = useState<AtlasPlace | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await requestJson<Atlas>("/api/notebook/atlas", {
          signal: controller.signal,
        });

        setAtlas(response);
        setError("");
      } catch (caught) {
        if (isAbortError(caught)) {
          return;
        }

        setError("I cannot lay the atlas out just now. Try again shortly.");
      }
    }

    void load();

    return () => controller.abort();
  }, [isSignedIn]);

  const places = atlas?.places;

  const placed = useMemo(
    () =>
      new Map(
        (places ?? []).map((place) => [
          place.entityId,
          project({ latitude: place.latitude, longitude: place.longitude }, EXTENT),
        ]),
      ),
    [places],
  );

  const lines = useMemo(() => ({ meridians: meridians(EXTENT), parallels: parallels(EXTENT) }), []);

  const handlers = useMemo<PinHandlers>(
    () => ({
      onEnter: (place) => setHovered(place),
      onLeave: () => setHovered(null),
      onPick: (place) => setPinned(place),
      onClear: () => setPinned(null),
    }),
    [],
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

  if (atlas === null) {
    return <p className="notebook-empty">Unrolling it…</p>;
  }

  if (atlas.status === "sparse") {
    return (
      <p className="notebook-empty">
        Not enough ground to draw yet. {atlas.placedCount} of {atlas.shelfCount} things on your
        shelf have a filming location filed against them, and Wikidata is where I get those — it is
        thorough about old films and quiet about new ones. Mark a few more and come back.
      </p>
    );
  }

  const active = hovered ?? pinned;
  const activeId = active?.entityId ?? "";
  const vague = atlas.places.filter(isVague).length;

  return (
    <div className="shelf-atlas">
      <div className="atlas-frame">
        <div className="atlas-readout">
          {active ? <AtlasCard place={active} /> : <AtlasSummary atlas={atlas} />}
        </div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-label="The world, flat, with a pin on every place something on your shelf was shot"
        >
          <rect
            x="0"
            y="0"
            width={WIDTH}
            height={HEIGHT}
            className="atlas-ground"
            onClick={() => setPinned(null)}
          />

          {lines.meridians.map((line) => (
            <line
              key={line.longitude}
              className={`atlas-line${line.longitude === 0 ? " prime" : ""}`}
              x1={line.x}
              y1={0}
              x2={line.x}
              y2={HEIGHT}
            />
          ))}

          {lines.parallels.map((line) => (
            <line
              key={line.latitude}
              className="atlas-line"
              x1={0}
              y1={line.y}
              x2={WIDTH}
              y2={line.y}
            />
          ))}

          <line className="atlas-line equator" x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} />

          {lines.parallels.map((line) => (
            <text key={line.latitude} className="atlas-degree" x={4} y={line.y - 4}>
              {line.label}
            </text>
          ))}

          {atlas.places.map((place) => {
            const spot = placed.get(place.entityId);

            return (
              <AtlasPin
                key={place.entityId}
                place={place}
                cx={spot?.x ?? 0}
                cy={spot?.y ?? 0}
                active={activeId === place.entityId}
                pinned={pinned?.entityId === place.entityId}
                handlers={handlers}
              />
            );
          })}
        </svg>
      </div>

      <ul className="atlas-key">
        <li className="placed">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5" />
          </svg>
          A place you could stand in
        </li>
        <li className="vague">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="5" />
          </svg>
          A country or a region, pinned at its middle
        </li>
        <li className="sized">Bigger means more of your shelf was shot there</li>
        <li className="sized">
          {atlas.places.length} places, {vague} of them only roughly placed
        </li>
      </ul>

      <p className="atlas-foot">
        No coastlines. I do not know them, and I am not going to draw a world I cannot vouch for —
        the lines are every thirty degrees and nothing else on here is guesswork. Where things were
        shot comes from{" "}
        <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">
          Wikidata
        </a>
        , which files it thoroughly for some films and not at all for others.
      </p>
    </div>
  );
}

import { memo } from "react";

import {
  furthest,
  mostUsed,
  pinNote,
  placeSubtitle,
  type AtlasPlace,
  type ShelfAtlas,
} from "../../domain/places";
import { bearingLabel } from "../../lib/equirectangular";
import { sentenceList } from "../../lib/string";

const COUNTRIES_NAMED = 4;

export const AtlasCard = memo(function AtlasCard({ place }: { place: AtlasPlace }) {
  const subtitle = placeSubtitle(place);

  return (
    <div className="atlas-card">
      <div className="atlas-card-name">
        <strong>{place.label}</strong>
        {subtitle && <span>{subtitle}</span>}
        <em>{bearingLabel(place)}</em>
      </div>

      <div className="atlas-card-shot">
        <span className="atlas-card-label">
          Shot here {place.titles.length === 1 ? "once" : `${place.titles.length} times`}
        </span>
        <ul>
          {place.titles.map((title) => (
            <li key={title.titleId}>
              {title.title}
              {title.year ? <small>{title.year}</small> : null}
            </li>
          ))}
        </ul>
      </div>

      <dl className="atlas-card-facts">
        <div>
          <dt>How well I know it</dt>
          <dd>
            {pinNote(place.pin)}
            {place.isCountry ? ". The record names the whole country and nothing narrower." : "."}
          </dd>
        </div>
      </dl>
    </div>
  );
});

export function AtlasSummary({ atlas }: { atlas: ShelfAtlas }) {
  const north = furthest(atlas.places, "north");
  const south = furthest(atlas.places, "south");
  const busiest = mostUsed(atlas.places);
  const named = atlas.countries.slice(0, COUNTRIES_NAMED);

  return (
    <div className="atlas-card atlas-card-blank">
      <p className="atlas-card-hint">
        Hover a pin, or tab to one, and I will tell you what was shot there.
      </p>

      <dl className="atlas-card-facts">
        <div>
          <dt>On this ground</dt>
          <dd>
            {atlas.placedCount} of {atlas.shelfCount} on your shelf, across {atlas.countries.length}{" "}
            {atlas.countries.length === 1 ? "country" : "countries"}
          </dd>
        </div>
        {named.length > 0 && (
          <div>
            <dt>Where you have been</dt>
            <dd>
              {sentenceList(named)}
              {atlas.countries.length > named.length
                ? `, and ${atlas.countries.length - named.length} more`
                : ""}
            </dd>
          </div>
        )}
        {north && south && north.entityId !== south.entityId && (
          <div>
            <dt>Top and bottom</dt>
            <dd>
              {north.label} is as far north as you go, {south.label} as far south
            </dd>
          </div>
        )}
        {busiest && busiest.titles.length > 1 && (
          <div>
            <dt>Most walked over</dt>
            <dd>
              {busiest.label}, {busiest.titles.length} times
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

import { Link } from "react-router-dom";

import { isVague, type TitlePlace } from "../../domain/places";
import { useTitlePlaces } from "../../hooks/useTitlePlaces";
import { sentenceList } from "../../lib/string";

const NAMES_SHOWN = 10;

function labels(places: TitlePlace[]) {
  return places.slice(0, NAMES_SHOWN).map((place) => place.label);
}

function placeLinks(places: TitlePlace[]) {
  return places.map((place) => (
    <Link key={place.label} to={`/listings?places=${encodeURIComponent(place.label)}`}>
      {place.label}
    </Link>
  ));
}

export function FilmingLine({ titleId }: { titleId: string }) {
  const places = useTitlePlaces(titleId);
  const shown = places.filming.slice(0, NAMES_SHOWN);
  const broad = places.filming.filter(isVague).length;
  const unnamed = places.filming.length - shown.length;

  if (places.filming.length === 0) {
    if (places.narrative.length === 0) {
      return null;
    }

    return (
      <div className="detail-ground">
        <span>Ground</span>
        <p>
          Nobody has filed where this was shot. It is set in{" "}
          {sentenceList(labels(places.narrative))}, which is a different thing.
        </p>
      </div>
    );
  }

  return (
    <div className="detail-ground">
      <span>Ground</span>
      <p>
        Shot at{" "}
        {placeLinks(shown).map((link, index) => (
          <span key={shown[index]?.label}>
            {index > 0 ? ", " : ""}
            {link}
          </span>
        ))}
        .
      </p>
      <small>
        {places.filming.length} {places.filming.length === 1 ? "place" : "places"} on Wikidata
        {unnamed > 0 ? `, ${unnamed} of them not listed here` : ""}
        {broad > 0
          ? ` · ${broad} named no finer than a country or a region, so read them as directions rather than addresses`
          : " · every one of them pinned to somewhere you could stand"}
      </small>
    </div>
  );
}

export type PlaceKind = "filming" | "narrative";

export type PlacePin = "exact" | "near" | "loose" | "centroid";

export type TitlePlace = {
  entityId: string;
  label: string;
  kind: PlaceKind;
  latitude: number;
  longitude: number;
  pin: PlacePin;
  country: string | null;
  isCountry: boolean;
};

export type TitlePlaces = { filming: TitlePlace[]; narrative: TitlePlace[] };

export type AtlasTitle = { titleId: string; title: string; year: number | null };

export type AtlasPlace = {
  entityId: string;
  label: string;
  country: string | null;
  latitude: number;
  longitude: number;
  pin: PlacePin;
  isCountry: boolean;
  titles: AtlasTitle[];
};

export type ShelfAtlas = {
  status: "ready" | "sparse";
  places: AtlasPlace[];
  shelfCount: number;
  placedCount: number;
  countries: string[];
};

const EXACT_DEGREES = 0.001;
const NEAR_DEGREES = 0.02;
const LOOSE_DEGREES = 0.5;

export function placePin(degrees: number): PlacePin {
  if (!Number.isFinite(degrees) || degrees > LOOSE_DEGREES) {
    return "centroid";
  }

  if (degrees <= EXACT_DEGREES) {
    return "exact";
  }

  return degrees <= NEAR_DEGREES ? "near" : "loose";
}

const PIN_NOTE: Record<PlacePin, string> = {
  exact: "pinned to within a hundred metres",
  near: "pinned to within a couple of kilometres",
  loose: "pinned to within fifty kilometres",
  centroid: "pinned only to the nearest degree, which is the middle of something large",
};

export function pinNote(pin: PlacePin) {
  return PIN_NOTE[pin];
}

export function isVague(place: { pin: PlacePin; isCountry: boolean }) {
  return place.isCountry || place.pin === "centroid";
}

export function placeSubtitle(place: { country: string | null; isCountry: boolean }) {
  return place.isCountry ? null : place.country;
}

export function furthest(places: AtlasPlace[], direction: "north" | "south") {
  return places.reduce<AtlasPlace | null>((held, place) => {
    if (!held) {
      return place;
    }

    const beats =
      direction === "north" ? place.latitude > held.latitude : place.latitude < held.latitude;

    return beats ? place : held;
  }, null);
}

export function mostUsed(places: AtlasPlace[]) {
  return places.reduce<AtlasPlace | null>(
    (held, place) => (!held || place.titles.length > held.titles.length ? place : held),
    null,
  );
}

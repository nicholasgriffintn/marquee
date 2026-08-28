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

export function isVague(place: { pin: PlacePin; isCountry: boolean }) {
  return place.isCountry || place.pin === "centroid";
}

export function placeSubtitle(place: { country: string | null; isCountry: boolean }) {
  return place.isCountry ? null : place.country;
}

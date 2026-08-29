import type { CatalogSection } from "./catalog";

const CURATED_RAIL_PREFIX = "rail-";
const PINNED_RAIL_PREFIX = "pinned-";

export type RailSource = "ai" | "person" | "cinema" | "broadcast";

export type RailStatus = "ready" | "generating" | "error";

export type DeliveredRail = CatalogSection & {
  source: RailSource;
  generationId?: string;
};

export type RailsDelivery = {
  status: RailStatus;
  revision: string;
  generationId: string;
  rails: DeliveredRail[];
};

export const NO_RAILS: RailsDelivery = {
  status: "ready",
  revision: "",
  generationId: "",
  rails: [],
};

export function curatedRailId(angle: string) {
  return `${CURATED_RAIL_PREFIX}${angle}`;
}

export function isCuratedRailId(railId: string) {
  return railId.startsWith(CURATED_RAIL_PREFIX);
}

export function isViewerShelfId(railId: string) {
  return isCuratedRailId(railId) || railId.startsWith(PINNED_RAIL_PREFIX);
}

export function curatedFrom(delivery: RailsDelivery) {
  return delivery.rails.filter((rail) => rail.source === "ai");
}

export function personalFrom(delivery: RailsDelivery) {
  return delivery.rails.filter((rail) => rail.source !== "ai");
}

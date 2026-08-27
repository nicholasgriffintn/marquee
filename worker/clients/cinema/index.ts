import { cineworldSource } from "./cineworld.ts";
import { picturehouseSource } from "./picturehouse.ts";
import type { CinemaSource } from "./types.ts";
import { vueSource } from "./vue.ts";

export const CINEMA_SOURCES: CinemaSource[] = [cineworldSource, picturehouseSource, vueSource];

export const CINEMA_SOURCE_IDS = CINEMA_SOURCES.map((source) => source.id);

export function cinemaSource(id: string) {
  return CINEMA_SOURCES.find((source) => source.id === id) ?? null;
}

export function isCinemaSourceId(value: unknown): value is string {
  return typeof value === "string" && CINEMA_SOURCE_IDS.includes(value);
}

export type { CinemaSource } from "./types.ts";

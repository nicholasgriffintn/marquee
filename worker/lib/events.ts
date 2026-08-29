import type { JourneyMode } from "../../src/domain/journeys.ts";
import type { Bindings } from "../types.ts";

export type MarqueeEvent = {
  name:
    | "search"
    | "browse"
    | "title_view"
    | "provider_exit"
    | "title_watched"
    | "shelf_save"
    | "shelf_remove"
    | "episode_save"
    | "episode_mark"
    | "curator_ask"
    | "rails_served"
    | "rails_built"
    | "rail_impression"
    | "rail_click"
    | "rail_feedback"
    | "usher_shown"
    | "usher_answered"
    | "usher_dismissed"
    | "usher_order"
    | "usher_pick"
    | "shelf_pinned"
    | "reel_play"
    | "guard_blocked"
    | "guard_throttled";
  viewerId?: string;
  titleId?: string;
  detail?: string;
  value?: number;
  journeyId?: string;
  source?: string;
  mode?: JourneyMode;
  rank?: number;
  latencyMs?: number;
  providerId?: string;
  monetization?: string;
};

export function recordEvent(env: Bindings, event: MarqueeEvent) {
  if (!env.EVENTS) {
    return;
  }

  try {
    env.EVENTS.writeDataPoint({
      indexes: [event.name],
      blobs: [
        event.name,
        event.viewerId ?? "anonymous",
        event.titleId ?? "",
        (event.detail ?? "").slice(0, 200),
        event.journeyId ?? "",
        event.source ?? "",
        event.providerId ?? "",
        event.monetization ?? "",
        event.mode ?? "",
      ],
      doubles: [event.value ?? 1, event.rank ?? -1, event.latencyMs ?? -1],
    });
  } catch {
    return;
  }
}

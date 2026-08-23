import type { Bindings } from "../types.ts";

export type MarqueeEvent = {
  name:
    | "search"
    | "browse"
    | "title_view"
    | "shelf_save"
    | "shelf_remove"
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
    | "guard_blocked"
    | "guard_throttled";
  viewerId?: string;
  titleId?: string;
  detail?: string;
  value?: number;
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
      ],
      doubles: [event.value ?? 1],
    });
  } catch {
    return;
  }
}

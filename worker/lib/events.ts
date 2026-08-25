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
  inputLength?: number;
  journeyId?: string;
  source?: string;
  position?: number;
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
      ],
      doubles: [event.value ?? 1, event.position ?? -1, event.inputLength ?? -1],
    });
  } catch {
    return;
  }
}

function coarseInputLength(input: string) {
  const length = input.length;

  if (length === 0) {
    return 0;
  }

  if (length <= 25) {
    return 25;
  }

  if (length <= 100) {
    return 100;
  }

  if (length <= 250) {
    return 250;
  }

  if (length <= 500) {
    return 500;
  }

  return 1_000;
}

export function recordInputMetric(
  env: Bindings,
  event: Omit<MarqueeEvent, "detail" | "inputLength">,
  input: string,
) {
  recordEvent(env, {
    ...event,
    detail: undefined,
    inputLength: coarseInputLength(input),
  });
}

export function recordSearchMetric(env: Bindings, query: string, resultCount: number) {
  recordInputMetric(env, { name: "search", value: resultCount }, query);
}

export function recordCuratorMetric(env: Bindings, prompt: string) {
  recordInputMetric(env, { name: "curator_ask" }, prompt);
}

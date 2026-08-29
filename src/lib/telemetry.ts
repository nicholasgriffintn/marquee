import { journeyFor } from "./journey";

type ClientEvent = "rail_impression" | "rail_click" | "title_view" | "provider_exit" | "reel_play";

type TrackPayload = {
  detail?: string;
  titleId?: string;
  journey?: string;
  rank?: number;
  providerId?: string;
  monetization?: string;
};

function queueBeacon(body: string) {
  try {
    globalThis.navigator?.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
  } catch {
    return;
  }
}

export function track(name: ClientEvent, payload: TrackPayload = {}) {
  const journey = payload.titleId ? journeyFor(payload.titleId) : null;

  queueBeacon(
    JSON.stringify({
      name,
      ...payload,
      journey: payload.journey ?? journey?.token,
      rank: payload.rank ?? journey?.rank,
    }),
  );
}

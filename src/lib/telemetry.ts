import { journeyFor } from "./journey";

type ClientEvent = "rail_impression" | "rail_click" | "title_view" | "provider_exit" | "reel_play";

type TrackPayload = {
  detail?: string;
  titleId?: string;
  journeyId?: string;
  decisionId?: string;
  source?: string;
  position?: number;
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
  const body = {
    name,
    ...payload,
    journeyId: payload.journeyId ?? journey?.id,
    decisionId: payload.decisionId ?? journey?.decisionId,
    source: payload.source ?? journey?.source,
    position: payload.position ?? journey?.position,
  };

  queueBeacon(JSON.stringify(body));
}

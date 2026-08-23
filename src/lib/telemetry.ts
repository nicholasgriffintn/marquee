import { journeyFor } from "./journey";

type ClientEvent = "rail_impression" | "rail_click" | "title_view" | "provider_exit";

type TrackPayload = {
  detail?: string;
  titleId?: string;
  journeyId?: string;
  source?: string;
  position?: number;
  providerId?: string;
  monetization?: string;
};

export function track(name: ClientEvent, payload: TrackPayload = {}) {
  const journey = payload.titleId ? journeyFor(payload.titleId) : null;
  const body = {
    name,
    ...payload,
    journeyId: payload.journeyId ?? journey?.id,
    source: payload.source ?? journey?.source,
    position: payload.position ?? journey?.position,
  };

  void fetch("/api/events", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

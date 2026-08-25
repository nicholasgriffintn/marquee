import { knownProviderOfferKind, providerRegistryIds } from "../../src/domain/providers.ts";
import { recordEvent, type MarqueeEvent } from "../lib/events.ts";
import { readJsonObject } from "../lib/http.ts";
import type { Bindings } from "../types.ts";

const CLIENT_EVENTS: ReadonlySet<string> = new Set([
  "rail_impression",
  "rail_click",
  "title_view",
  "provider_exit",
  "reel_play",
]);

const SOURCES: ReadonlySet<string> = new Set([
  "acclaimed",
  "archive",
  "awarded",
  "binge",
  "boxoffice",
  "buzz",
  "cast",
  "close",
  "comfort",
  "ended",
  "family",
  "fresh",
  "gems",
  "genre",
  "local-broadcast",
  "local-cinema",
  "mood",
  "on-this-week",
  "person",
  "pinned",
  "service",
  "short",
  "studio",
  "subtitles",
  "trending",
  "usher_order",
  "usher_order_backup",
  "usher_pick",
  "widen",
]);

const DYNAMIC_SOURCE_PREFIXES = [
  ["service-new-", "service"],
  ["service-", "service"],
  ["studio-", "studio"],
  ["genre-", "genre"],
  ["mood-", "mood"],
  ["person-", "person"],
  ["pinned-", "pinned"],
] as const;

type ClientEventName =
  | "rail_impression"
  | "rail_click"
  | "title_view"
  | "provider_exit"
  | "reel_play";

function eventName(value: unknown): ClientEventName | null {
  return typeof value === "string" && CLIENT_EVENTS.has(value) ? (value as ClientEventName) : null;
}

function position(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 500
    ? value
    : undefined;
}

function titleId(value: unknown) {
  return typeof value === "string" && /^(movie|tv):[1-9]\d{0,9}$/u.test(value) ? value : undefined;
}

function providerId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return providerRegistryIds.has(value) || /^tmdb:[1-9]\d{0,9}$/u.test(value) ? value : undefined;
}

function journeyId(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value.toLowerCase()
    : undefined;
}

function source(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  if (SOURCES.has(value)) {
    return value;
  }

  return DYNAMIC_SOURCE_PREFIXES.find(([prefix]) => value.startsWith(prefix))?.[1];
}

function monetization(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const values = [...new Set(value.split(","))];
  const kinds = values.flatMap((label) => {
    const kind = knownProviderOfferKind(label);

    return kind ? [kind] : [];
  });

  return values.length > 0 && values.length <= 5 && kinds.length === values.length
    ? [...new Set(kinds)].join(",")
    : undefined;
}

function attributedEvent(body: Record<string, unknown>) {
  const knownTitleId = titleId(body.titleId);
  const knownJourneyId = journeyId(body.journeyId);
  const knownSource = source(body.source);
  const knownPosition = position(body.position);

  return {
    ...(knownTitleId ? { titleId: knownTitleId } : {}),
    ...(knownJourneyId ? { journeyId: knownJourneyId } : {}),
    ...(knownSource ? { source: knownSource } : {}),
    ...(knownPosition === undefined ? {} : { position: knownPosition }),
  };
}

export function clientEventPayload(
  body: Record<string, unknown>,
  viewerId?: string,
): MarqueeEvent | null {
  const name = eventName(body.name);

  if (!name) {
    return null;
  }

  const base = { name, viewerId };

  if (name === "rail_impression") {
    const knownSource = source(body.source);

    return { ...base, ...(knownSource ? { source: knownSource } : {}) };
  }

  if (name === "rail_click" || name === "title_view") {
    return { ...base, ...attributedEvent(body) };
  }

  if (name === "provider_exit") {
    const knownProviderId = providerId(body.providerId);
    const knownMonetization = monetization(body.monetization);

    return {
      ...base,
      ...attributedEvent(body),
      ...(knownProviderId ? { providerId: knownProviderId } : {}),
      ...(knownMonetization ? { monetization: knownMonetization } : {}),
    };
  }

  return base;
}

export async function parseClientEventRequest(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
    return null;
  }

  const body = await readJsonObject(request);

  return body ? clientEventPayload(body) : null;
}

export function recordClientEvent(env: Bindings, event: MarqueeEvent, viewerId?: string) {
  const recorded = { ...event, viewerId };

  recordEvent(env, recorded);

  return recorded;
}

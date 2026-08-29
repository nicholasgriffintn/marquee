import { JOURNEY_TTL_MS } from "../domain/journeys";

type Journey = { token: string; rank?: number; startedAt: number };

const journeys = new Map<string, Journey>();
const LIMIT = 40;

export function startJourney(titleId: string, token: string | null | undefined, rank?: number) {
  if (!token) {
    journeys.delete(titleId);

    return;
  }

  if (journeys.size >= LIMIT) {
    const oldest = journeys.keys().next().value;

    if (oldest) {
      journeys.delete(oldest);
    }
  }

  journeys.set(titleId, { token, startedAt: Date.now(), ...(rank === undefined ? {} : { rank }) });
}

export function journeyFor(titleId: string): Journey | null {
  const journey = journeys.get(titleId);

  if (!journey) {
    return null;
  }

  if (Date.now() - journey.startedAt >= JOURNEY_TTL_MS) {
    journeys.delete(titleId);

    return null;
  }

  return journey;
}

export function startJourneys(items: { id: string }[], token: string | null | undefined) {
  items.forEach((item, index) => startJourney(item.id, token, index));
}

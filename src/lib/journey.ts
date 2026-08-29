export type JourneyStart = { source: string; position?: number; decisionId?: string };

type Journey = JourneyStart & { id: string };

const journeys = new Map<string, Journey>();
const LIMIT = 40;

function mint() {
  return crypto.randomUUID();
}

export function startJourney(titleId: string, start: JourneyStart) {
  const journey: Journey = { ...start, id: mint() };

  if (journeys.size >= LIMIT) {
    const oldest = journeys.keys().next().value;

    if (oldest) {
      journeys.delete(oldest);
    }
  }

  journeys.set(titleId, journey);

  return journey;
}

export function journeyFor(titleId: string): Journey | null {
  return journeys.get(titleId) ?? null;
}

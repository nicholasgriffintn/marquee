type Journey = { id: string; source: string; position?: number };

const journeys = new Map<string, Journey>();
const LIMIT = 40;

function mint() {
  return crypto.randomUUID();
}

export function startJourney(titleId: string, source: string, position?: number) {
  const journey: Journey = { id: mint(), source, ...(position === undefined ? {} : { position }) };

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

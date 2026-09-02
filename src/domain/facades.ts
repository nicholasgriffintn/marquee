export type FacadeId = "budapest" | "stanford" | "dollhouse" | "last-showing";

export type FacadeOption = { id: FacadeId; label: string; blurb: string };

export const FACADE_OPTIONS: FacadeOption[] = [
  {
    id: "last-showing",
    label: "The Last Showing",
    blurb: "Shut for the night. The board still lit, the usher on the step with his torch.",
  },
  {
    id: "budapest",
    label: "The Budapest",
    blurb: "A grand front, dead centre. Five windows across, turrets, a runner out to the kerb.",
  },
  {
    id: "stanford",
    label: "The Stanford",
    blurb: "A chevron blade and twin reader wings, four titles up, a box office in the middle.",
  },
  {
    id: "dollhouse",
    label: "The Dollhouse",
    blurb: "The building cut open. Foyer, screen, corridor and booth, all lit, all on show.",
  },
];

export const DEFAULT_FACADE: FacadeId = "last-showing";

export function isFacadeId(value: unknown): value is FacadeId {
  return FACADE_OPTIONS.some((option) => option.id === value);
}

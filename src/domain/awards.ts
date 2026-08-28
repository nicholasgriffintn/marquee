export type AwardOutcome = "won" | "nominated";

export type AwardEntry = {
  awardId: string;
  label: string;
  ceremonyYear: number | null;
  outcome: AwardOutcome;
};

export type AwardSummary = {
  wins: number;
  nominations: number;
  entries: AwardEntry[];
};

export type AwardRun = {
  awardId: string;
  label: string;
  total: number;
  held: number;
  watched: number;
};

export const NO_AWARDS: AwardSummary = { wins: 0, nominations: 0, entries: [] };

export function isAwardOutcome(value: unknown): value is AwardOutcome {
  return value === "won" || value === "nominated";
}

export function awardTally({ wins, nominations }: AwardSummary) {
  return [
    wins > 0 ? `${wins} win${wins === 1 ? "" : "s"}` : "",
    nominations > 0 ? `${nominations} nomination${nominations === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function awardLine(entry: AwardEntry) {
  return entry.ceremonyYear ? `${entry.label} (${entry.ceremonyYear})` : entry.label;
}

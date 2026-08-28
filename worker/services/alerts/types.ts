import type { Bindings } from "../../types.ts";

export const ALERT_KINDS = ["arrival", "season", "cinema", "person"] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

export type AlertCandidate = {
  kind: AlertKind;
  viewerId: string;
  key: string;
  titleId: string;
  headline: string;
  detail: string;
  path: string;
};

export type DetectorOptions = { send: boolean };

export type Detector = {
  kind: AlertKind;
  priority: number;
  find(env: Bindings, options: DetectorOptions): Promise<AlertCandidate[]>;
};

export function isAlertKind(value: unknown): value is AlertKind {
  return typeof value === "string" && ALERT_KINDS.includes(value as AlertKind);
}

export const KIND_LABELS: Record<AlertKind, string> = {
  arrival: "now showing",
  season: "back for another run",
  cinema: "on a real screen",
  person: "someone you follow",
};

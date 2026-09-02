import { isRecord } from "../lib/values";
import type { MediaTitle } from "./catalog";

export type ScreeningStatus = "open" | "closed";

export type RoomKind = "tour" | "pick";

export type BallotOption = { id: string; label: string; blurb: string };

export type StageDefinition = {
  id: string;
  name: string;
  prompt: string;
  actions?: Record<string, string>;
};

export type GameKind = "first" | "higher" | "whose" | "describe";

export type RoomTool =
  | { id: "ballot"; trigger: { kind: "join" }; question: string; options: BallotOption[] }
  | { id: "cursors"; trigger: { kind: "presence" } }
  | { id: "stages"; trigger: { kind: "act" } }
  | { id: "usher"; trigger: { kind: "mention"; handle: string } }
  | { id: "games"; trigger: { kind: "host" }; kinds: GameKind[]; rounds: number; seconds: number }
  | { id: "steer"; trigger: { kind: "host" }; stage: string; seconds: number }
  | { id: "reactions"; trigger: { kind: "presence" }; emoji: string[] }
  | { id: "polls"; trigger: { kind: "host" }; question: string; size: number };

export type GameOption = {
  id: string;
  label: string;
  posterUrl: string | null;
  note: string | null;
};

export type GameQuestion = {
  kind: GameKind;
  prompt: string;
  posterUrl: string | null;
  options: GameOption[];
};

export type GamePhase = "question" | "reveal" | "over";

export type GameState = {
  id: string;
  round: number;
  of: number;
  phase: GamePhase;
  question: GameQuestion | null;
  endsAt: number;
  correct: string | null;
  counts: Record<string, number>;
  scores: Record<string, number>;
};

export type SteerPhase = "from" | "to" | "walk";

export type SteerState = {
  id: string;
  phase: SteerPhase;
  options: MediaTitle[];
  endsAt: number;
  counts: Record<string, number>;
  from: MediaTitle | null;
  to: MediaTitle | null;
};

export type CursorMark = { key: string; stage: string; x: number; y: number };

export type PollState = {
  id: string;
  question: string;
  options: MediaTitle[];
  counts: Record<string, number>;
  status: "open" | "closed";
  openedAt: string;
  winner: string | null;
};

export type RoomDefinition = {
  kind: RoomKind;
  title: string;
  path: string;
  hash: string;
  stages: StageDefinition[];
  tools: RoomTool[];
};

export type MemberRole = "host" | "guest";

export type Member = {
  key: string;
  name: string;
  role: MemberRole;
  choice: string;
  avatar: string;
  stage: string | null;
  online: boolean;
  joinedAt: string;
};

export type FeedKind = "join" | "say" | "act" | "usher" | "note" | "status";

export type FeedEntry = {
  id: string;
  at: string;
  kind: FeedKind;
  member: string | null;
  text: string;
  stage?: string;
  verb?: string;
  replyTo?: string;
};

export type RoomSnapshot = {
  id: string;
  definition: RoomDefinition;
  status: ScreeningStatus;
  createdAt: string;
  hostStage: string | null;
  members: Member[];
  feed: FeedEntry[];
  you: string;
  game: GameState | null;
  steer: SteerState | null;
  polls: PollState[];
  lightsDown: boolean;
};

export type ClientMessage =
  | { type: "cursor"; stage: string; x: number; y: number }
  | { type: "stage"; stage: string }
  | { type: "say"; text: string }
  | { type: "act"; stage: string; verb: string; detail: string }
  | { type: "game"; action: "start" | "stop" }
  | { type: "answer"; optionId: string }
  | { type: "steer"; action: "start" | "stop" }
  | { type: "pick"; optionId: string }
  | { type: "react"; emoji: string }
  | { type: "poll"; action: "start" | "close" }
  | { type: "vote"; optionId: string }
  | { type: "lights"; down: boolean };

export type ServerMessage =
  | { type: "snapshot"; room: RoomSnapshot }
  | { type: "member"; member: Member }
  | { type: "cursors"; marks: CursorMark[] }
  | { type: "host"; stage: string | null }
  | { type: "feed"; entry: FeedEntry }
  | { type: "status"; status: ScreeningStatus }
  | { type: "game"; game: GameState | null }
  | { type: "steer"; steer: SteerState | null }
  | { type: "reaction"; key: string; emoji: string; stage: string; x: number; y: number }
  | { type: "polls"; polls: PollState[] }
  | { type: "lights"; down: boolean }
  | { type: "error"; message: string };

export const SCREENING_PARAM = "screening";

export const SCREENING_LIMITS = {
  say: 400,
  detail: 160,
  feedTail: 160,
  members: 200,
  optionId: 80,
  emoji: 8,
} as const;

const SCREENING_ID = /^[0-9a-f]{16}$/u;

export function isScreeningId(value: unknown): value is string {
  return typeof value === "string" && SCREENING_ID.test(value);
}

export function isRoomKind(value: unknown): value is RoomKind {
  return value === "tour" || value === "pick";
}

export function isScreeningStatus(value: unknown): value is ScreeningStatus {
  return value === "open" || value === "closed";
}

export function screeningIdFromSearch(search: string) {
  const value = new URLSearchParams(search).get(SCREENING_PARAM);

  return isScreeningId(value) ? value : null;
}

export function screeningUrl(origin: string, id: string, definition: RoomDefinition) {
  return `${origin}${definition.path}?${SCREENING_PARAM}=${id}${definition.hash ? `#${definition.hash}` : ""}`;
}

export function mentionsHandle(text: string, handle: string) {
  return new RegExp(`(^|[^\\w])@${handle}(?![\\w])`, "iu").test(text);
}

export function findTool<Id extends RoomTool["id"]>(definition: RoomDefinition, id: Id) {
  return definition.tools.find((tool): tool is Extract<RoomTool, { id: Id }> => tool.id === id);
}

export function stageOf(definition: RoomDefinition, stageId: string | null) {
  return definition.stages.find((stage) => stage.id === stageId) ?? null;
}

export function memberTally(definition: RoomDefinition, members: Member[]) {
  const ballot = findTool(definition, "ballot");
  const tally: Record<string, number> = {};

  for (const option of ballot?.options ?? []) {
    tally[option.id] = members.filter((member) => member.choice === option.id).length;
  }

  return tally;
}

const SERVER_TYPES = new Set([
  "snapshot",
  "member",
  "cursors",
  "host",
  "feed",
  "status",
  "game",
  "steer",
  "reaction",
  "polls",
  "lights",
  "error",
]);

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  return isServerMessage(value) ? value : null;
}

function isServerMessage(value: unknown): value is ServerMessage {
  return isRecord(value) && typeof value.type === "string" && SERVER_TYPES.has(value.type);
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const message = value;

  switch (message.type) {
    case "cursor":
      return typeof message.stage === "string" &&
        typeof message.x === "number" &&
        typeof message.y === "number" &&
        Number.isFinite(message.x) &&
        Number.isFinite(message.y)
        ? {
            type: "cursor",
            stage: message.stage,
            x: Math.min(Math.max(message.x, 0), 1),
            y: Math.min(Math.max(message.y, 0), 1),
          }
        : null;
    case "stage":
      return typeof message.stage === "string" ? { type: "stage", stage: message.stage } : null;
    case "say":
      return typeof message.text === "string"
        ? { type: "say", text: message.text.trim().slice(0, SCREENING_LIMITS.say) }
        : null;
    case "act":
      return typeof message.stage === "string" &&
        typeof message.verb === "string" &&
        typeof message.detail === "string"
        ? {
            type: "act",
            stage: message.stage,
            verb: message.verb,
            detail: message.detail.trim().slice(0, SCREENING_LIMITS.detail),
          }
        : null;
    case "game":
    case "steer":
      return message.action === "start" || message.action === "stop"
        ? { type: message.type, action: message.action }
        : null;
    case "poll":
      return message.action === "start" || message.action === "close"
        ? { type: "poll", action: message.action }
        : null;
    case "answer":
    case "pick":
    case "vote":
      return typeof message.optionId === "string"
        ? { type: message.type, optionId: message.optionId.slice(0, SCREENING_LIMITS.optionId) }
        : null;
    case "lights":
      return typeof message.down === "boolean" ? { type: "lights", down: message.down } : null;
    case "react":
      return typeof message.emoji === "string"
        ? { type: "react", emoji: message.emoji.slice(0, SCREENING_LIMITS.emoji) }
        : null;
    default:
      return null;
  }
}

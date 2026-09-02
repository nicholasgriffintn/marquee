import { FACADE_OPTIONS } from "./facades";
import type { RoomDefinition, RoomKind, StageDefinition } from "./screening";
import { TOUR_STOPS, type TourStopId } from "./tour";

export const USHER_HANDLE = "usher";

const STAGE_ACTIONS: Partial<Record<TourStopId, Record<string, string>>> = {
  foyer: { ask: "asked the board for" },
  corridor: { walk: "set off walking" },
  screen: { play: "started a print" },
  door: { knock: "knocked and got let in", refused: "knocked and got turned away" },
};

export const TOUR_ROOM: RoomDefinition = {
  kind: "tour",
  title: "The tour",
  path: "/tour",
  hash: "step",
  stages: TOUR_STOPS.map((stop): StageDefinition => ({
    id: stop.id,
    name: stop.name,
    prompt: stop.line,
    actions: STAGE_ACTIONS[stop.id],
  })),
  tools: [
    {
      id: "ballot",
      trigger: { kind: "join" },
      question: "Which cinema are you buying a ticket for?",
      options: FACADE_OPTIONS.map(({ id, label, blurb }) => ({ id, label, blurb })),
    },
    { id: "cursors", trigger: { kind: "presence" } },
    { id: "stages", trigger: { kind: "act" } },
    { id: "usher", trigger: { kind: "mention", handle: USHER_HANDLE } },
    {
      id: "games",
      trigger: { kind: "host" },
      kinds: ["first", "higher", "whose", "describe"],
      rounds: 3,
      seconds: 15,
    },
    { id: "steer", trigger: { kind: "host" }, stage: "corridor", seconds: 12 },
    { id: "reactions", trigger: { kind: "presence" }, emoji: ["👏", "😂", "😮", "🍿"] },
    { id: "polls", trigger: { kind: "host" }, question: "Which of these tonight?", size: 4 },
  ],
};

export const PICK_ROOM: RoomDefinition = {
  kind: "pick",
  title: "Tonight's pick",
  path: "/screening",
  hash: "",
  stages: [],
  tools: [
    {
      id: "ballot",
      trigger: { kind: "join" },
      question: "Which cinema are you buying a ticket for?",
      options: FACADE_OPTIONS.map(({ id, label, blurb }) => ({ id, label, blurb })),
    },
    { id: "usher", trigger: { kind: "mention", handle: USHER_HANDLE } },
    { id: "reactions", trigger: { kind: "presence" }, emoji: ["👏", "😂", "😮", "🍿"] },
    { id: "polls", trigger: { kind: "host" }, question: "Which of these tonight?", size: 4 },
  ],
};

export const ROOMS: Record<RoomKind, RoomDefinition> = { tour: TOUR_ROOM, pick: PICK_ROOM };

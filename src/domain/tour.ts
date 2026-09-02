import type { UsherFace } from "./usher";

export type TourStopId =
  | "step"
  | "foyer"
  | "pad"
  | "corridor"
  | "screen"
  | "street"
  | "door"
  | "booth"
  | "exit";

export type TourStop = {
  id: TourStopId;
  name: string;
  slug: string;
  face: UsherFace;
  line: string;
  receipt: string;
  membersOnly?: boolean;
};

export const TOUR_STOPS: TourStop[] = [
  {
    id: "step",
    name: "The step",
    slug: "Ext. The Marquee — After the Last Showing",
    face: "idle",
    line: "Building's shut. Torch works. Come on then, and mind the step.",
    receipt:
      "Everything past this point is the live building answering. There is not a screenshot on this page.",
  },
  {
    id: "foyer",
    name: "The foyer",
    slug: "Int. The Foyer — The Board",
    face: "thinking",
    line: "Go on. Describe it, do not name it. Nobody ever comes in with the title.",
    receipt:
      "A keyword pass over titles, synopses, keywords and credits for precision, bge-m3 embeddings in Vectorize for meaning, the two interleaved and reranked by bge-reranker-base.",
  },
  {
    id: "pad",
    name: "The pad",
    slug: "Int. The Foyer — The Pad Comes Out",
    face: "idle",
    line: "Three questions. Nobody has ever needed a fourth.",
    receipt:
      "The model names the pick from a shortlist it can see, and never from the whole catalogue. Every pick writes one decisions row — candidates, scores, model, tokens — and a random id that comes back on every journey event.",
    membersOnly: true,
  },
  {
    id: "corridor",
    name: "The corridor",
    slug: "Int. The Corridor — The Long Way Round",
    face: "thinking",
    line: "Name me two. I will walk you from one to the other and tell you what I am standing on.",
    receipt:
      "He walks the straight line between the two of them and stops at whatever real film sits nearest to each point along it, refusing anything that is barely a step from the last and anything that fails to get closer to the far end. Nobody's genre list is consulted at any point.",
  },
  {
    id: "screen",
    name: "The back screen",
    slug: "Int. The Small Screen at the Back",
    face: "dormant",
    line: "Ticket is nothing back here. The print is out of copyright, which is not the same as being any good.",
    receipt:
      "Whether a print is free here is not the American question. Section 13B of the CDPA runs seventy years from the last surviving director, writer or composer, read off Wikidata. A print that clears only the American term plays from wherever it already lives; one that clears the UK term as well earns a copy in our own room, served as byte ranges so the scrubber works.",
  },
  {
    id: "street",
    name: "The street",
    slug: "Ext. The Street — The Ones With Buildings",
    face: "idle",
    line: "I did not ask you where you are. I know roughly, the same way the postman does.",
    receipt:
      "The position comes off Cloudflare's edge — about a town, never a street. Nothing is asked of you, no prompt is raised, and nothing is kept against an account.",
    membersOnly: true,
  },
  {
    id: "door",
    name: "The door",
    slug: "Int. The Corridor — The Door",
    face: "unimpressed",
    line: "Most of the job is letting people in. The rest of it is not. Go on, try me.",
    receipt:
      "One guard, two tables. The first rule matching the path wins and the list ends in a catch-all, so a new endpoint is covered the moment it is mounted.",
  },
  {
    id: "booth",
    name: "The booth",
    slug: "Int. The Projection Box — He Is Not In",
    face: "unimpressed",
    line: "Back in ten minutes, that note says. It has said that since 1974.",
    receipt:
      "Sweeps are a Workflow on two crons, fanned out over a queue. Embeddings are keyed on a hash of their source text, so nothing is re-embedded for the sake of it.",
  },
  {
    id: "exit",
    name: "The exit",
    slug: "Ext. The Marquee — Go On Then",
    face: "pleased",
    line: "That is the building. Rows are lettered. Mind the step on the way out.",
    receipt:
      "The same building answers agents over MCP, calendars over iCalendar and readers over Atom. It is one catalogue behind all of it.",
  },
];

export const TOUR_OPENERS = [
  "a time loop where the same day repeats",
  "dinosaurs escape a theme park",
  "a hobbit carries a ring to a volcano",
  "samurai defends a village",
  "boxer trains in philadelphia and runs up steps",
];

export function stopIndex(id: string) {
  return TOUR_STOPS.findIndex((stop) => stop.id === id);
}

export function stopAt(index: number) {
  return TOUR_STOPS[Math.min(Math.max(index, 0), TOUR_STOPS.length - 1)];
}

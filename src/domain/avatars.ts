import { type FacadeId, isFacadeId } from "./facades";

export type AvatarHat = "pillbox" | "peaked" | "beret" | "flatcap";

export type AvatarProp = "none" | "key" | "torch" | "ticket" | "brush" | "tray";

export type AvatarMood = "idle" | "pleased" | "dormant" | "thinking";

export type AvatarSpec = {
  id: string;
  cinema: FacadeId;
  name: string;
  hat: AvatarHat;
  hatColour: string;
  coat: string;
  prop: AvatarProp;
  mood: AvatarMood;
};

const CORAL = "#ff6e56";
const BLUE = "#3157e8";
const ACID = "#c9f35d";
const PAPER_DEEP = "#e8e4d8";
const INK = "#11130f";
const PANEL = "#2f352b";

export const AVATARS: Record<FacadeId, AvatarSpec[]> = {
  budapest: [
    {
      id: "lobby-boy",
      cinema: "budapest",
      name: "Lobby boy",
      hat: "pillbox",
      hatColour: CORAL,
      coat: CORAL,
      prop: "key",
      mood: "pleased",
    },
    {
      id: "concierge",
      cinema: "budapest",
      name: "Concierge",
      hat: "pillbox",
      hatColour: BLUE,
      coat: BLUE,
      prop: "key",
      mood: "idle",
    },
    {
      id: "bell-captain",
      cinema: "budapest",
      name: "Bell captain",
      hat: "pillbox",
      hatColour: INK,
      coat: CORAL,
      prop: "tray",
      mood: "thinking",
    },
    {
      id: "the-baroness",
      cinema: "budapest",
      name: "The Baroness",
      hat: "pillbox",
      hatColour: ACID,
      coat: PANEL,
      prop: "none",
      mood: "dormant",
    },
  ],
  stanford: [
    {
      id: "ticket-tearer",
      cinema: "stanford",
      name: "Ticket tearer",
      hat: "peaked",
      hatColour: CORAL,
      coat: BLUE,
      prop: "ticket",
      mood: "idle",
    },
    {
      id: "projectionist",
      cinema: "stanford",
      name: "Projectionist",
      hat: "peaked",
      hatColour: INK,
      coat: PANEL,
      prop: "none",
      mood: "thinking",
    },
    {
      id: "matinee-regular",
      cinema: "stanford",
      name: "Matinee regular",
      hat: "flatcap",
      hatColour: BLUE,
      coat: PAPER_DEEP,
      prop: "ticket",
      mood: "pleased",
    },
    {
      id: "doorman",
      cinema: "stanford",
      name: "Doorman",
      hat: "peaked",
      hatColour: BLUE,
      coat: CORAL,
      prop: "none",
      mood: "dormant",
    },
  ],
  dollhouse: [
    {
      id: "the-architect",
      cinema: "dollhouse",
      name: "The architect",
      hat: "beret",
      hatColour: BLUE,
      coat: PAPER_DEEP,
      prop: "brush",
      mood: "thinking",
    },
    {
      id: "set-dresser",
      cinema: "dollhouse",
      name: "Set dresser",
      hat: "beret",
      hatColour: CORAL,
      coat: ACID,
      prop: "brush",
      mood: "pleased",
    },
    {
      id: "miniaturist",
      cinema: "dollhouse",
      name: "Miniaturist",
      hat: "beret",
      hatColour: ACID,
      coat: BLUE,
      prop: "none",
      mood: "idle",
    },
    {
      id: "scene-painter",
      cinema: "dollhouse",
      name: "Scene painter",
      hat: "beret",
      hatColour: INK,
      coat: CORAL,
      prop: "brush",
      mood: "dormant",
    },
  ],
  "last-showing": [
    {
      id: "night-porter",
      cinema: "last-showing",
      name: "Night porter",
      hat: "flatcap",
      hatColour: INK,
      coat: PANEL,
      prop: "torch",
      mood: "idle",
    },
    {
      id: "last-patron",
      cinema: "last-showing",
      name: "Last patron",
      hat: "flatcap",
      hatColour: CORAL,
      coat: BLUE,
      prop: "ticket",
      mood: "dormant",
    },
    {
      id: "the-cleaner",
      cinema: "last-showing",
      name: "The cleaner",
      hat: "flatcap",
      hatColour: ACID,
      coat: PAPER_DEEP,
      prop: "torch",
      mood: "pleased",
    },
    {
      id: "the-critic",
      cinema: "last-showing",
      name: "The critic",
      hat: "beret",
      hatColour: PANEL,
      coat: INK,
      prop: "none",
      mood: "thinking",
    },
  ],
};

export function avatarById(id: string) {
  return Object.values(AVATARS)
    .flat()
    .find((avatar) => avatar.id === id);
}

export function avatarFor(cinema: string, ordinal: number) {
  if (!isFacadeId(cinema)) {
    return null;
  }

  const pool = AVATARS[cinema];

  return pool[ordinal % pool.length];
}

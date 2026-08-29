import type { MediaTitle } from "../../src/domain/catalog.ts";
import { showingFor, type TonightOrder } from "../../src/domain/usher.ts";
import { newDecisionId, runAiObject } from "../ai/run.ts";
import { USHER_VOICE } from "../ai/usher-voice.ts";
import type { ChatMessage } from "../lib/curator-payload.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { isRecord } from "../lib/values.ts";
import { readBeliefs } from "../repositories/beliefs.ts";
import { readGuests, type Guest } from "../repositories/guests.ts";
import { readShelfDetail } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { shortlistFor, type ShortlistConstraints } from "./usher-pick.ts";
import { preferenceSummary } from "./usher.ts";
import { factBrief, factsFor, serviceFor } from "./why.ts";

const ORDER_SHORTLIST = 12;
const BACKUPS = 2;
const FAMILY_UNSUITABLE_GENRES = ["horror", "thriller", "crime", "war"];

const COMPANY: Record<
  string,
  {
    note: string;
    text: string;
    genres?: string[];
    bannedGenres?: string[];
    allowAdult?: boolean;
  }
> = {
  alone: {
    note: "watching on their own, answerable to nobody",
    text: "a film to watch alone without explaining yourself to anyone",
  },
  two: {
    note: "two of them, so it has to suit both",
    text: "a film two people can agree on without either of them sulking",
  },
  room: {
    note: "a full room, where somebody will talk over the quiet bits",
    text: "a crowd-pleaser that survives people talking through it",
  },
  family: {
    note: "children in the room, so nothing that will need explaining afterwards",
    text: "something the whole family can watch together",
    genres: ["family", "animation", "adventure", "comedy"],
    bannedGenres: FAMILY_UNSUITABLE_GENRES,
    allowAdult: false,
  },
};

const LENGTH: Record<
  string,
  { note: string; maxRuntime?: number; mediaType?: "movie" | "tv"; text?: string }
> = {
  short: { note: "ninety minutes at most", maxRuntime: 100, mediaType: "movie" },
  evening: { note: "an ordinary evening's worth", maxRuntime: 150, mediaType: "movie" },
  long: { note: "as long as it needs to be", text: "a long film that earns its running time" },
  episode: {
    note: "a series to start tonight, one episode in",
    mediaType: "tv",
    text: "a series with a first episode worth staying up for",
  },
};

const MOOD: Record<string, { note: string; genres: string[]; text: string }> = {
  easy: {
    note: "easy going, nothing that asks much of them",
    genres: ["comedy", "adventure", "family"],
    text: "warm, easy watching that asks nothing of you",
  },
  clever: {
    note: "clever, something with a bit of thought behind it",
    genres: ["drama", "mystery", "science fiction"],
    text: "clever, carefully made, something to chew on afterwards",
  },
  funny: {
    note: "funny, and actually funny, not merely light",
    genres: ["comedy"],
    text: "genuinely funny, the sort people quote afterwards",
  },
  tense: {
    note: "tense, something that grips",
    genres: ["thriller", "crime", "mystery"],
    text: "tense and gripping, hard to leave halfway",
  },
  moving: {
    note: "moving, and they have asked for it, so do not soften it",
    genres: ["drama", "romance"],
    text: "moving, quietly devastating, worth the state it leaves you in",
  },
  surprise: {
    note: "a surprise, so reach past the obvious",
    genres: [],
    text: "unexpected, something they would never have chosen themselves",
  },
};

const ORDER_PROMPT = [
  USHER_VOICE,
  "A viewer has told you who is in the room, how long they have, and what they are in the mood for.",
  "Pick one title you would stake your name on, then two backups in case they turn the first one down.",
  "Each gets one sentence on why, in your own voice. Use only the facts you are given about a title; never invent a comparison, a runtime or a service.",
  "Never repeat a title across the three.",
  'Reply with JSON only: {"pick":{"titleId":"","line":""},"backups":[{"titleId":"","line":""},{"titleId":"","line":""}]}.',
].join(" ");

export function constraintsFor(order: TonightOrder, guests: Guest[] = []): ShortlistConstraints {
  const company = COMPANY[order.company];
  const length = LENGTH[order.length];
  const mood = MOOD[order.mood];
  const bannedGenres = [
    ...new Set(
      [...guests.flatMap((guest) => guest.vetoes), ...(company?.bannedGenres ?? [])].map((genre) =>
        genre.toLowerCase(),
      ),
    ),
  ];
  const banned = new Set(bannedGenres);
  const leanings = guests.flatMap((guest) => guest.leanings);
  const genres = [
    ...new Set([...(mood?.genres ?? []), ...(company?.genres ?? []), ...leanings]),
  ].filter((genre) => !banned.has(genre.toLowerCase()));

  return {
    limit: ORDER_SHORTLIST,
    ...(length?.maxRuntime ? { maxRuntime: length.maxRuntime } : {}),
    ...(length?.mediaType ? { mediaType: length.mediaType } : {}),
    ...(genres.length ? { genres } : {}),
    ...(bannedGenres.length ? { bannedGenres } : {}),
    ...(company?.allowAdult === false ? { allowAdult: false } : {}),
    text: [mood?.text, company?.text, length?.text].filter(Boolean).join(", "),
  };
}

function orderLine(item: MediaTitle, order: TonightOrder) {
  if (order.company === "family") {
    return "Nothing in it you will have to talk your way out of afterwards.";
  }

  if (order.length === "episode") {
    return "One episode. See how you feel after that.";
  }

  if (order.mood === "surprise") {
    return "You did say surprise me.";
  }

  return "This one. I would not offer it otherwise.";
}

function backupLine(index: number) {
  return index === 0 ? "If that one is a no." : "And if it is still a no.";
}

export async function pickToOrder(
  env: Bindings,
  viewerId: string,
  order: TonightOrder,
  options: {
    providerIds?: string[];
    rejected?: string[];
    hour?: number;
    isWeekend?: boolean;
    guestIds?: string[];
  } = {},
) {
  const rejected = (options.rejected ?? []).filter(isKnownTitle).slice(0, 40);
  const showing = showingFor(options.hour ?? 20, options.isWeekend ?? false);
  const everyone = await readGuests(env.DB, viewerId);
  const guests = options.guestIds?.length
    ? everyone.filter((guest) => options.guestIds?.includes(guest.id))
    : [];
  const { titles, viewer } = await shortlistFor(env, viewerId, {
    ...(options.providerIds ? { providerIds: options.providerIds } : {}),
    rejected,
    constraints: constraintsFor(order, guests),
  });

  if (titles.length === 0) {
    return null;
  }

  const [shelf, beliefs] = await Promise.all([
    readShelfDetail(env.DB, viewerId, 20).catch((): never[] => []),
    readBeliefs(env.DB, viewerId),
  ]);
  const dress = (item: MediaTitle, line: string) => {
    const service = serviceFor(item, viewer.providerIds);

    return { item, line, service, facts: factsFor(item, { service, shelf, beliefs }) };
  };

  const listing = titles
    .map(
      (title) =>
        `${title.id} · ${title.title}${title.year ? ` (${title.year})` : ""} · ${
          title.mediaType === "movie" ? "film" : "series"
        }${title.runtimeMinutes ? `, ${title.runtimeMinutes} min` : ""} · ${title.genres
          .slice(0, 3)
          .join(", ")} · ${title.overview.slice(0, 200)}`,
    )
    .join("\n");
  const summary = preferenceSummary(viewer.preferences);
  const messages: ChatMessage[] = [
    { role: "system", content: ORDER_PROMPT },
    {
      role: "user",
      content: [
        showing.brief,
        "",
        guests.length
          ? `In the room with them: ${guests
              .map(
                (guest) =>
                  `${guest.name}${guest.vetoes.length ? ` (will not sit through ${guest.vetoes.join(", ")})` : ""}`,
              )
              .join("; ")}. The pick has to work for all of them.`
          : "",
        `Tonight they want: ${[
          COMPANY[order.company]?.note,
          LENGTH[order.length]?.note,
          MOOD[order.mood]?.note,
        ]
          .filter(Boolean)
          .join("; ")}.`,
        summary ? `What I know about them otherwise: ${summary}` : "I know very little else.",
        "",
        `Tonight's options:\n${listing}`,
        "",
        titles
          .map((title) => {
            const service = serviceFor(title, viewer.providerIds);

            return `${title.id} — ${factBrief(factsFor(title, { service, shelf, beliefs }))}`;
          })
          .join("\n"),
      ].join("\n"),
    },
  ];
  const fallback = () => ({
    order,
    pick: dress(titles[0], orderLine(titles[0], order)),
    backups: titles.slice(1, 1 + BACKUPS).map((item, index) => dress(item, backupLine(index))),
  });

  try {
    const parsed = await runAiObject(env, {
      feature: "usher_order",
      decisionId: newDecisionId(),
      messages,
    });

    const proposed = isRecord(parsed) && isRecord(parsed.pick) ? parsed.pick : null;

    if (!proposed || !isKnownTitle(proposed.titleId)) {
      return fallback();
    }

    const headline = titles.find((title) => title.id === proposed.titleId);

    if (!headline) {
      return fallback();
    }

    const taken = new Set([headline.id]);
    const suggested = isRecord(parsed) && Array.isArray(parsed.backups) ? parsed.backups : [];
    const backups: { item: MediaTitle; line: string; service: string }[] = [];

    for (const entry of suggested) {
      if (backups.length >= BACKUPS || !isRecord(entry) || !isKnownTitle(entry.titleId)) {
        continue;
      }

      const item = titles.find((title) => title.id === entry.titleId);

      if (!item || taken.has(item.id)) {
        continue;
      }

      taken.add(item.id);
      backups.push(
        dress(
          item,
          typeof entry.line === "string" && entry.line.trim()
            ? entry.line.trim().slice(0, 160)
            : backupLine(backups.length),
        ),
      );
    }

    for (const item of titles) {
      if (backups.length >= BACKUPS) {
        break;
      }

      if (!taken.has(item.id)) {
        taken.add(item.id);
        backups.push(dress(item, backupLine(backups.length)));
      }
    }

    const line =
      typeof proposed.line === "string" && proposed.line.trim()
        ? proposed.line.trim().slice(0, 160)
        : orderLine(headline, order);

    return { order, pick: dress(headline, line), backups };
  } catch (error) {
    logError("usher_order_failed", error);

    return fallback();
  }
}

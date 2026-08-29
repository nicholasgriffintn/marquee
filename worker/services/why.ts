import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import type { Belief } from "../../src/domain/notebook.ts";
import { isStreamingOffer } from "../../src/domain/providers.ts";
import { activeBeliefs } from "../repositories/beliefs.ts";
import type { readShelfDetail } from "../repositories/viewer-context.ts";

export type ShelfEntry = Awaited<ReturnType<typeof readShelfDetail>>[number];

function parseGenres(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function runtimeFact(title: MediaTitle) {
  if (title.mediaType === "tv") {
    return title.numberOfSeasons
      ? `${title.numberOfSeasons} season${title.numberOfSeasons === 1 ? "" : "s"}`
      : "a series";
  }

  return title.runtimeMinutes ? `${title.runtimeMinutes} minutes` : "";
}

function shelfAnchor(title: MediaTitle, shelf: ShelfEntry[]) {
  const genres = new Set(title.genres.map((genre) => genre.toLowerCase()));
  const match = shelf.find((entry) => {
    if (entry.title === title.title || entry.status === "dropped") {
      return false;
    }

    return parseGenres(entry.genres).some((genre) => genres.has(genre.toLowerCase()));
  });

  if (!match) {
    return "";
  }

  return match.rating
    ? `like ${match.title}, which you gave ${match.rating} out of 5`
    : `same corner as ${match.title} on your shelf`;
}

function beliefFact(title: MediaTitle, beliefs: Belief[]) {
  const genres = title.genres.map((genre) => genre.toLowerCase());
  const match = activeBeliefs(beliefs).find((belief) =>
    genres.some((genre) => belief.key.endsWith(`genre:${genre}`)),
  );

  return match ? match.value.replace(/\.$/u, "").toLowerCase() : "";
}

export function factsFor(
  title: MediaTitle,
  options: { service: string; shelf: ShelfEntry[]; beliefs: Belief[] },
) {
  return [
    runtimeFact(title),
    options.service ? `on ${options.service}` : "not on your services",
    shelfAnchor(title, options.shelf),
    beliefFact(title, options.beliefs),
  ]
    .map((fact) => fact.trim())
    .filter(Boolean);
}

export function factBrief(facts: string[]) {
  return facts.length ? `Facts you may use, and nothing else: ${facts.join("; ")}.` : "";
}

export function serviceFor(item: MediaTitle, providerIds: string[]) {
  const all = item.providers ?? [];
  const mine = providerIds.length
    ? all.filter((provider) => providerIds.includes(provider.id))
    : all;
  const pool = mine.length ? mine : all;
  const streaming = pool.find((provider: ProviderAvailability) =>
    provider.offerTypes.some(isStreamingOffer),
  );
  const chosen = streaming ?? pool[0];

  if (!chosen) {
    return "";
  }

  return streaming ? chosen.name : `${chosen.name}, to rent`;
}

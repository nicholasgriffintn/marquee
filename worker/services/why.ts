import type { MediaTitle, ProviderAvailability } from "../../src/domain/catalog.ts";
import { beliefSteersPicks, type Belief } from "../../src/domain/notebook.ts";
import { isStreamingOffer } from "../../src/domain/providers.ts";
import { jsonStringList } from "../lib/values.ts";
import type { readShelfDetail } from "../repositories/viewer-context.ts";

export type ShelfEntry = Awaited<ReturnType<typeof readShelfDetail>>[number];

const POSITIVE_RATING = 4;

const GENRE_EXPANSIONS: Record<string, string[]> = {
  "action & adventure": ["action", "adventure"],
  "sci-fi & fantasy": ["science fiction", "fantasy"],
  "war & politics": ["war", "politics"],
};

function genreTraits(genres: string[]) {
  return new Set(
    genres.flatMap((genre) => {
      const normalised = genre.trim().toLowerCase();

      return normalised ? (GENRE_EXPANSIONS[normalised] ?? [normalised]) : [];
    }),
  );
}

function keywordTraits(keywords: string[]) {
  return new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean));
}

function sharedValues(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => right.has(value));
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
  const genres = genreTraits(title.genres);
  const keywords = keywordTraits(title.keywords ?? []);
  const [match] = shelf
    .flatMap((entry) => {
      if (
        entry.titleId === title.id ||
        entry.title === title.title ||
        entry.status === "dropped" ||
        entry.rating === null ||
        entry.rating < POSITIVE_RATING
      ) {
        return [];
      }

      const sharedGenres = sharedValues(genres, genreTraits(jsonStringList(entry.genres)));
      const sharedKeywords = sharedValues(keywords, keywordTraits(jsonStringList(entry.keywords)));
      const traits = [...new Set([...sharedKeywords, ...sharedGenres])];

      if (traits.length < 2) {
        return [];
      }

      return [
        {
          entry,
          traits,
          score: sharedKeywords.length * 3 + sharedGenres.length * 2,
        },
      ];
    })
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        (right.entry.rating ?? 0) - (left.entry.rating ?? 0) ||
        left.entry.title.localeCompare(right.entry.title),
    );

  if (!match) {
    return "";
  }

  const shared = match.traits.slice(0, 2).join(" and ");

  return `shares ${shared} with ${match.entry.title}, which you gave ${match.entry.rating} out of 5`;
}

function beliefFact(title: MediaTitle, beliefs: Belief[]) {
  const genres = title.genres.map((genre) => genre.toLowerCase());
  const match = beliefs
    .filter((belief) => beliefSteersPicks(belief))
    .find((belief) => genres.some((genre) => belief.key.endsWith(`genre:${genre}`)));

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

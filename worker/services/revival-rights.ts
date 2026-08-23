import type { RevivalRightsBasis } from "../../src/domain/revival.ts";
import { readFilmAuthors, type FilmAuthors } from "../clients/wikidata-rights.ts";
import { logError } from "../lib/logging.ts";
import { readUncheckedRights, storeUkRights } from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";

const UK_FILM_TERM_YEARS = 70;
const UK_ANONYMOUS_TERM_YEARS = 70;
const CROWN_TERM_YEARS = 50;

export type UkVerdict = {
  clear: boolean;
  expiresYear: number | null;
  basis: RevivalRightsBasis;
  note: string;
};

export function currentUkYear(now = new Date()) {
  return now.getUTCFullYear();
}

export function ukExpiryFromDeath(deathYear: number) {
  return deathYear + UK_FILM_TERM_YEARS + 1;
}

export function ukExpiryFromRelease(releaseYear: number) {
  return releaseYear + UK_ANONYMOUS_TERM_YEARS + 1;
}

export function crownExpiryFromRelease(releaseYear: number) {
  return releaseYear + CROWN_TERM_YEARS + 1;
}

export function assessUk(
  authors: FilmAuthors | null,
  year: number | null,
  basis: RevivalRightsBasis,
  now = new Date(),
): UkVerdict {
  const thisYear = currentUkYear(now);

  if (basis === "crown-expired" && year !== null) {
    const expires = crownExpiryFromRelease(year);

    return {
      clear: expires <= thisYear,
      expiresYear: expires,
      basis,
      note: `Crown copyright, ${CROWN_TERM_YEARS} years from publication in ${year}`,
    };
  }

  if (authors && authors.withDeathYear > 0 && authors.latestDeathYear !== null) {
    const complete = authors.withDeathYear === authors.named;
    const expires = ukExpiryFromDeath(authors.latestDeathYear);
    const clear = complete && expires <= thisYear;

    return {
      clear,
      expiresYear: expires,
      basis: clear ? "uk-expired" : basis,
      note: complete
        ? `Last of the named authors died ${authors.latestDeathYear}, so UK copyright ran out at the end of ${expires - 1}`
        : `${authors.named - authors.withDeathYear} of ${authors.named} named authors have no recorded death date, so the UK term cannot be closed`,
    };
  }

  if (authors && authors.named > 0) {
    return {
      clear: false,
      expiresYear: null,
      basis,
      note: `${authors.named} named author${authors.named === 1 ? "" : "s"} with no recorded death date, so the UK term cannot be established`,
    };
  }

  if (year !== null) {
    const expires = ukExpiryFromRelease(year);

    return {
      clear: expires <= thisYear,
      expiresYear: expires,
      basis,
      note: `No authors recorded anywhere, treated as anonymous: ${UK_ANONYMOUS_TERM_YEARS} years from first release in ${year}`,
    };
  }

  return {
    clear: false,
    expiresYear: null,
    basis,
    note: "No authors and no release year, so nothing to measure a UK term against",
  };
}

export async function checkRevivalRights(env: Bindings, limit = 60) {
  const pending = await readUncheckedRights(env.DB, limit);

  if (pending.length === 0) {
    return { checked: 0, cleared: 0 };
  }

  const imdbIds = pending.flatMap((row) => (row.imdbId ? [row.imdbId] : []));
  let authors = new Map<string, FilmAuthors>();

  try {
    authors = await readFilmAuthors(imdbIds);
  } catch (error) {
    logError("revival_rights_lookup_failed", error, { area: "revival" });
  }

  let cleared = 0;

  for (const row of pending) {
    const verdict = assessUk(
      row.imdbId ? (authors.get(row.imdbId) ?? null) : null,
      row.year,
      row.rightsBasis,
    );

    // oxlint-disable-next-line no-await-in-loop
    await storeUkRights(env.DB, row.id, verdict);

    if (verdict.clear) {
      cleared += 1;
    }
  }

  return { checked: pending.length, cleared };
}

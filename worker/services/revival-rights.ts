import type { RevivalRightsBasis, RevivalSource } from "../../src/domain/revival.ts";
import { readFilmAuthors, type FilmAuthors } from "../clients/wikidata-rights.ts";
import { logError } from "../lib/logging.ts";
import { readUncheckedRights, storeUkRights } from "../repositories/revival.ts";
import type { Bindings } from "../types.ts";

const UK_FILM_TERM_YEARS = 70;
const UK_ANONYMOUS_TERM_YEARS = 70;

export type UkVerdict = {
  clear: boolean;
  expiresYear: number | null;
  basis: RevivalRightsBasis;
  note: string;
};

export type RightsSubject = {
  source: RevivalSource;
  year: number | null;
  director: string | null;
  rightsBasis: RevivalRightsBasis;
  imdbId: string | null;
  wikidataId: string | null;
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

function releasedByArchive(subject: RightsSubject) {
  return (
    subject.source === "europeana" &&
    (subject.rightsBasis === "eu-institution" || subject.rightsBasis === "cc0")
  );
}

function unresolvedNote(subject: RightsSubject, authors: FilmAuthors | null) {
  if (authors && authors.named > 0) {
    return `${authors.named} named author${authors.named === 1 ? "" : "s"} on Wikidata, ${authors.named - authors.withDeathYear} without a death date, so the UK term cannot be closed`;
  }

  if (subject.director) {
    return `Credited to ${subject.director}, whose death date could not be found, so the UK term cannot be closed`;
  }

  if (!subject.imdbId) {
    return "Not matched to a catalogue title, so its authors were never looked up and the UK term cannot be closed";
  }

  return "Wikidata lists no director, writer or composer for this title, so the UK term cannot be closed";
}

export function assessUk(
  subject: RightsSubject,
  authors: FilmAuthors | null,
  now = new Date(),
): UkVerdict {
  const thisYear = currentUkYear(now);
  const basis = subject.rightsBasis;

  if (authors && authors.named > 0 && authors.withDeathYear === authors.named) {
    const latest = authors.latestDeathYear ?? 0;
    const expires = ukExpiryFromDeath(latest);
    const clear = expires <= thisYear;

    return {
      clear,
      expiresYear: expires,
      basis: clear ? "uk-expired" : basis,
      note: clear
        ? `Last of the ${authors.named} named authors died ${latest}, so UK copyright ran out at the end of ${expires - 1}`
        : `Last of the ${authors.named} named authors died ${latest}, so UK copyright runs until the end of ${expires - 1}`,
    };
  }

  if (releasedByArchive(subject)) {
    return {
      clear: true,
      expiresYear: null,
      basis,
      note: "Released outright by the archive that holds it; the UK term could not be confirmed independently",
    };
  }

  const anonymous = subject.year === null ? null : ukExpiryFromRelease(subject.year);

  return {
    clear: false,
    expiresYear: null,
    basis,
    note: anonymous
      ? `${unresolvedNote(subject, authors)}. If it were genuinely anonymous the term would ${
          anonymous <= thisYear ? "have run out" : "run until"
        } the end of ${anonymous - 1}`
      : unresolvedNote(subject, authors),
  };
}

export async function checkRevivalRights(env: Bindings, limit = 60) {
  const pending = await readUncheckedRights(env.DB, limit);

  if (pending.length === 0) {
    return { checked: 0, cleared: 0 };
  }

  let authors = new Map<string, FilmAuthors>();

  try {
    authors = await readFilmAuthors(
      pending.map((row) => ({ key: row.id, wikidataId: row.wikidataId, imdbId: row.imdbId })),
    );
  } catch (error) {
    logError("revival_rights_lookup_failed", error, { area: "revival" });
  }

  let cleared = 0;

  for (const row of pending) {
    const verdict = assessUk(row, authors.get(row.id) ?? null);

    // oxlint-disable-next-line no-await-in-loop
    await storeUkRights(env.DB, row.id, verdict);

    if (verdict.clear) {
      cleared += 1;
    }
  }

  return { checked: pending.length, cleared };
}

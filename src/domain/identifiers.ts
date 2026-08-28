export const IDENTIFIER_FIELDS = [
  "letterboxdId",
  "rottenTomatoesId",
  "metacriticId",
  "traktId",
] as const;

export type IdentifierField = (typeof IDENTIFIER_FIELDS)[number];

export type TitleIdentifiers = Record<IdentifierField, string | null>;

type IdentifierLink = { label: string; url: string };

type IdentifierTemplate = {
  label: string;
  pattern: RegExp;
  url: (id: string) => string;
};

const TEMPLATES: Record<IdentifierField, IdentifierTemplate> = {
  letterboxdId: {
    label: "Letterboxd",
    pattern: /^[a-z0-9][a-z0-9-]{0,120}$/u,
    url: (id) => `https://letterboxd.com/film/${id}/`,
  },
  rottenTomatoesId: {
    label: "Rotten Tomatoes",
    pattern: /^(?:m|tv)\/[a-z0-9][a-z0-9_-]{0,120}$/u,
    url: (id) => `https://www.rottentomatoes.com/${id}`,
  },
  metacriticId: {
    label: "Metacritic",
    pattern: /^(?:movie|tv)\/[a-z0-9][a-z0-9-]{0,120}$/u,
    url: (id) => `https://www.metacritic.com/${id}`,
  },
  traktId: {
    label: "Trakt",
    pattern: /^(?:movies|shows)\/[a-z0-9][a-z0-9-]{0,120}$/u,
    url: (id) => `https://trakt.tv/${id}`,
  },
};

export function cleanIdentifier(field: IdentifierField, value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  return TEMPLATES[field].pattern.test(trimmed) ? trimmed : null;
}

export function identifierLinks(ids: Partial<TitleIdentifiers> | undefined): IdentifierLink[] {
  return IDENTIFIER_FIELDS.flatMap((field) => {
    const id = cleanIdentifier(field, ids?.[field]);

    return id ? [{ label: TEMPLATES[field].label, url: TEMPLATES[field].url(id) }] : [];
  });
}

export const MUTED_GENRE_LIMIT = 12;

const GENRE_LENGTH = 40;

export function mutedGenreList(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  const cleaned = values.flatMap((value) =>
    typeof value === "string" ? [value.trim().toLowerCase().slice(0, GENRE_LENGTH)] : [],
  );

  return [...new Set(cleaned.filter(Boolean))].slice(0, MUTED_GENRE_LIMIT);
}

export function isMutedGenre(genre: string, muted: string[]) {
  return muted.includes(genre.trim().toLowerCase());
}

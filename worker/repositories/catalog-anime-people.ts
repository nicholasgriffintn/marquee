import type { AnimeCharacter, AnimeStaffMember, MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

export async function readAnimeCharacterMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<AnimeCharacter & { titleId: string }>(
        `SELECT title_id AS "titleId", name, role, voice_actor AS "voiceActor"
         FROM catalog_title_anime_characters
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")}) ORDER BY title_id, position`,
        [...wave],
      )
      .then((r) => r.rows),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, AnimeCharacter[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...c }) => c),
    );
  }

  return values;
}

export async function writeAnimeCharacterRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_characters",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.characters ?? []).map((character, position): DatabaseValue[] => [
      title.id,
      character.name,
      character.role,
      character.voiceActor,
      position,
    ]),
  );

  await insertRows(
    db,
    5,
    18,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_anime_characters (title_id, name, role, voice_actor, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}
       ON CONFLICT DO NOTHING`,
  );
}

export async function readAnimeStaffMap(db: Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .query<AnimeStaffMember & { titleId: string }>(
        `SELECT title_id AS "titleId", name, role FROM catalog_title_anime_staff
         WHERE title_id IN (${wave.map((_, index) => `$${index + 1}`).join(",")}) ORDER BY title_id, position`,
        [...wave],
      )
      .then((r) => r.rows),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, AnimeStaffMember[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...s }) => s),
    );
  }

  return values;
}

export async function writeAnimeStaffRows(db: Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_staff",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.staff ?? []).map((member, position): DatabaseValue[] => [
      title.id,
      member.name,
      member.role,
      position,
    ]),
  );

  await insertRows(
    db,
    4,
    22,
    rows,
    (chunk) =>
      `INSERT INTO catalog_title_anime_staff (title_id, name, role, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}
       ON CONFLICT DO NOTHING`,
  );
}

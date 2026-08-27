import { logError } from "../lib/logging.ts";
import { jsonStringList } from "../lib/values.ts";

export type Guest = {
  id: string;
  name: string;
  vetoes: string[];
  leanings: string[];
};

type GuestRow = { id: string; name: string; vetoes: string; leanings: string };

const MAX_GUESTS = 8;
const GUEST_TRAITS = 8;

function guestTraits(value: string) {
  return jsonStringList(value, { limit: GUEST_TRAITS });
}

export async function readGuests(db: D1Database, viewerId: string): Promise<Guest[]> {
  if (!viewerId) {
    return [];
  }

  try {
    const rows = await db
      .prepare(
        `SELECT id, name, vetoes, leanings FROM viewer_guests
          WHERE viewer_id = ?1 ORDER BY created_at LIMIT ?2`,
      )
      .bind(viewerId, MAX_GUESTS)
      .all<GuestRow>();

    return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      vetoes: guestTraits(row.vetoes),
      leanings: guestTraits(row.leanings),
    }));
  } catch (error) {
    logError("guests_read_failed", error);

    return [];
  }
}

export async function saveGuest(
  db: D1Database,
  viewerId: string,
  guest: { id?: string; name: string; vetoes: string[]; leanings: string[] },
) {
  const id = guest.id ?? crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO viewer_guests (id, viewer_id, name, vetoes, leanings)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         vetoes = excluded.vetoes,
         leanings = excluded.leanings
       WHERE viewer_guests.viewer_id = excluded.viewer_id`,
    )
    .bind(
      id,
      viewerId,
      guest.name.slice(0, 40),
      JSON.stringify(guest.vetoes.slice(0, 8)),
      JSON.stringify(guest.leanings.slice(0, 8)),
    )
    .run();

  return id;
}

export async function removeGuest(db: D1Database, viewerId: string, guestId: string) {
  const result = await db
    .prepare(`DELETE FROM viewer_guests WHERE id = ?1 AND viewer_id = ?2`)
    .bind(guestId, viewerId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function guestOwned(db: D1Database, viewerId: string, guestId: string) {
  const row = await db
    .prepare(`SELECT 1 AS found FROM viewer_guests WHERE id = ?1 AND viewer_id = ?2`)
    .bind(guestId, viewerId)
    .first<{ found: number }>();

  return Boolean(row);
}

export async function guestCount(db: D1Database, viewerId: string) {
  const row = await db
    .prepare(`SELECT count(*) AS total FROM viewer_guests WHERE viewer_id = ?1`)
    .bind(viewerId)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export const GUEST_LIMIT = MAX_GUESTS;

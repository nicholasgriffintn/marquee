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

export async function readGuests(db: Database, viewerId: string): Promise<Guest[]> {
  if (!viewerId) {
    return [];
  }

  try {
    const rows = await db.query<GuestRow>(
      `SELECT id, name, vetoes, leanings FROM viewer_guests
          WHERE viewer_id = $1 ORDER BY created_at LIMIT $2`,
      [viewerId, MAX_GUESTS],
    );

    return rows.rows.map((row) => ({
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
  db: Database,
  viewerId: string,
  guest: { id?: string; name: string; vetoes: string[]; leanings: string[] },
) {
  const id = guest.id ?? crypto.randomUUID();

  await db.execute(
    `INSERT INTO viewer_guests (id, viewer_id, name, vetoes, leanings)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         vetoes = excluded.vetoes,
         leanings = excluded.leanings
       WHERE viewer_guests.viewer_id = excluded.viewer_id`,
    [
      id,
      viewerId,
      guest.name.slice(0, 40),
      JSON.stringify(guest.vetoes.slice(0, 8)),
      JSON.stringify(guest.leanings.slice(0, 8)),
    ],
  );

  return id;
}

export async function removeGuest(db: Database, viewerId: string, guestId: string) {
  const result = await db.execute(`DELETE FROM viewer_guests WHERE id = $1 AND viewer_id = $2`, [
    guestId,
    viewerId,
  ]);

  return (result.rowCount ?? 0) > 0;
}

export async function guestOwned(db: Database, viewerId: string, guestId: string) {
  const row = await db.first<{ found: number }>(
    `SELECT 1 AS found FROM viewer_guests WHERE id = $1 AND viewer_id = $2`,
    [guestId, viewerId],
  );

  return Boolean(row);
}

export async function guestCount(db: Database, viewerId: string) {
  const row = await db.first<{ total: number }>(
    `SELECT count(*) AS total FROM viewer_guests WHERE viewer_id = $1`,
    [viewerId],
  );

  return row?.total ?? 0;
}

export const GUEST_LIMIT = MAX_GUESTS;

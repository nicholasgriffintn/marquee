import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import type { DeliveredRail } from "../../src/domain/rails.ts";
import { hoursFrom, startOfHour } from "../lib/dates.ts";
import { logError } from "../lib/logging.ts";
import { titleCase } from "../lib/text.ts";
import { readFollowedPeople } from "../repositories/beliefs.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import { readNearbyCinemas, readShowingTitles } from "../repositories/cinemas.ts";
import { readPerson, readPersonTitleIds } from "../repositories/people.ts";
import type { Bindings } from "../types.ts";

const MIN_RAIL = 3;
const RAIL_SIZE = 14;
const PEOPLE_RAILS = 3;
const CINEMA_RADIUS_KM = 30;
const CINEMA_HORIZON_DAYS = 7;
const BROADCAST_HORIZON_DAYS = 7;

function placeName(origin: ViewerOrigin | null) {
  return origin?.label?.trim() || null;
}

async function peopleRails(env: Bindings, viewerId: string): Promise<DeliveredRail[]> {
  const names = (await readFollowedPeople(env.DB, viewerId)).slice(0, PEOPLE_RAILS);

  if (names.length === 0) {
    return [];
  }

  const rails = await Promise.all(
    names.map(async (name) => {
      const person = await readPerson(env.DB, name);
      const ids = person ? await readPersonTitleIds(env.DB, person.personId, RAIL_SIZE * 2) : [];
      const items = (await readItems(env.DB, ids, RAIL_SIZE)).slice(0, RAIL_SIZE);
      const label = titleCase(name);

      return {
        id: `person-${name.replaceAll(/\W+/gu, "-")}`,
        title: `More from ${label}`,
        description: `Everything of ${label}'s in the catalogue, newest first`,
        reason: `You follow ${label}`,
        items,
        source: "person",
      } satisfies DeliveredRail;
    }),
  );

  return rails.filter((rail) => rail.items.length >= MIN_RAIL);
}

async function cinemaRail(
  env: Bindings,
  origin: ViewerOrigin | null,
): Promise<DeliveredRail | null> {
  if (!origin) {
    return null;
  }

  const cinemas = await readNearbyCinemas(env.DB, origin, CINEMA_RADIUS_KM);

  if (cinemas.length === 0) {
    return null;
  }

  const showing = await readShowingTitles(
    env.DB,
    cinemas.map((cinema) => cinema.id),
    CINEMA_HORIZON_DAYS,
    RAIL_SIZE * 2,
  );
  const items = (
    await readItems(
      env.DB,
      showing.map((row) => row.titleId),
      RAIL_SIZE,
    )
  ).slice(0, RAIL_SIZE);

  if (items.length < MIN_RAIL) {
    return null;
  }

  const place = placeName(origin);

  return {
    id: "local-cinema",
    title: place ? `On near ${place}` : "On at a cinema near you",
    description: `Playing within ${CINEMA_RADIUS_KM}km over the next week`,
    reason: place ? `Cinemas around ${place}` : "Cinemas near you",
    items,
    source: "cinema",
  };
}

async function broadcastRail(env: Bindings): Promise<DeliveredRail | null> {
  const anchor = startOfHour();
  const rows = await env.DB.query<{ id: string }>(
    `SELECT s.title_id AS id
       FROM title_schedule AS s
       JOIN catalog_titles AS t ON t.id = s.title_id
      WHERE s.airs_at BETWEEN CAST($1 AS timestamptz) AND CAST($2 AS timestamptz)
        AND s.network IS NOT NULL
      GROUP BY s.title_id, t.popularity
      ORDER BY t.popularity DESC
      LIMIT $3`,
    [anchor, hoursFrom(anchor, BROADCAST_HORIZON_DAYS * 24), RAIL_SIZE * 2],
  );
  const items = (
    await readItems(
      env.DB,
      rows.rows.map((row) => row.id),
      RAIL_SIZE,
    )
  ).slice(0, RAIL_SIZE);

  if (items.length < MIN_RAIL) {
    return null;
  }

  return {
    id: "local-broadcast",
    title: "On the box this week",
    description: "On a channel over the next seven days",
    reason: "Broadcast schedule",
    items,
    source: "broadcast",
  };
}

export async function getPersonalRails(
  env: Bindings,
  viewerId: string | null,
  origin: ViewerOrigin | null,
): Promise<DeliveredRail[]> {
  try {
    const [people, cinema, broadcast] = await Promise.all([
      viewerId ? peopleRails(env, viewerId) : Promise.resolve([]),
      cinemaRail(env, origin),
      broadcastRail(env),
    ]);

    return [...people, cinema, broadcast].filter((rail): rail is DeliveredRail => rail !== null);
  } catch (error) {
    logError("personal_rails_failed", error, { area: "catalogue" });

    return [];
  }
}

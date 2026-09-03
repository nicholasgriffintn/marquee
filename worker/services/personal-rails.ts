import { accessTier, type ViewerAccess } from "../../src/domain/access.ts";
import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import {
  titleHasPreferredAudioLanguage,
  titleMatchesPreferredLanguage,
} from "../../src/domain/languages.ts";
import type { DeliveredRail } from "../../src/domain/rails.ts";
import { withKvCache } from "../lib/cache.ts";
import { logError } from "../lib/logging.ts";
import { titleCase } from "../lib/text.ts";
import { readFollowedPeople } from "../repositories/beliefs.ts";
import { readSummaryItems } from "../repositories/catalog-reader.ts";
import { readNearbyCinemas, readShowingTitles } from "../repositories/cinemas.ts";
import { readNotebookPreferences } from "../repositories/notebook-preferences.ts";
import { readPerson, readPersonTitleIds } from "../repositories/people.ts";
import { readProviderPreferences } from "../repositories/profile.ts";
import type { Bindings } from "../types.ts";

const MIN_RAIL = 3;
const RAIL_SIZE = 14;
const PEOPLE_RAILS = 3;
const CINEMA_RADIUS_KM = 30;
const CINEMA_HORIZON_DAYS = 7;
const PERSONAL_CACHE_SECONDS = 300;
const ORIGIN_PRECISION = 2;

function placeName(origin: ViewerOrigin | null) {
  return origin?.label?.trim() || null;
}

async function peopleRails(
  env: Bindings,
  viewerId: string,
  preferredLanguage: string,
  providerIds: string[],
  access: ViewerAccess,
): Promise<DeliveredRail[]> {
  const names = (await readFollowedPeople(env.DB, viewerId)).slice(0, PEOPLE_RAILS);

  if (names.length === 0) {
    return [];
  }

  const rails = await Promise.all(
    names.map(async (name) => {
      const person = await readPerson(env.DB, name);
      const ids = person ? await readPersonTitleIds(env.DB, person.personId, RAIL_SIZE * 2) : [];
      const items = (await readSummaryItems(env.DB, ids, access, RAIL_SIZE * 2))
        .filter((item) => titleHasPreferredAudioLanguage(item, [preferredLanguage], providerIds))
        .slice(0, RAIL_SIZE);
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
  preference: {
    cinemaId: string | null;
    cinemaName: string | null;
    location: string;
    language: string;
    required: boolean;
  },
  access: ViewerAccess,
): Promise<DeliveredRail | null> {
  if (preference.required && (!preference.cinemaId || !preference.location)) {
    return null;
  }

  if (!preference.required && !origin) {
    return null;
  }

  const cinemaIds = preference.cinemaId
    ? [preference.cinemaId]
    : (await readNearbyCinemas(env.DB, origin as ViewerOrigin, CINEMA_RADIUS_KM)).map(
        (cinema) => cinema.id,
      );

  if (cinemaIds.length === 0) {
    return null;
  }

  const showing = await readShowingTitles(env.DB, cinemaIds, CINEMA_HORIZON_DAYS, RAIL_SIZE * 2);
  const items = (
    await readSummaryItems(
      env.DB,
      showing.map((row) => row.titleId),
      access,
      RAIL_SIZE * 2,
    )
  )
    .filter((item) => titleMatchesPreferredLanguage(item.originalLanguage, preference.language))
    .slice(0, RAIL_SIZE);

  if (items.length < MIN_RAIL) {
    return null;
  }

  const place = preference.location || placeName(origin);
  const cinema = preference.cinemaName;

  return {
    id: "local-cinema",
    title: cinema ? `On at ${cinema}` : place ? `On near ${place}` : "On at a cinema near you",
    description: cinema
      ? "Playing at your preferred cinema over the next week"
      : `Playing within ${CINEMA_RADIUS_KM}km over the next week`,
    reason: cinema
      ? `Your cinema in ${place}`
      : place
        ? `Cinemas around ${place}`
        : "Cinemas near you",
    items,
    source: "cinema",
  };
}

function personalCacheKey(
  viewerId: string | null,
  origin: ViewerOrigin | null,
  providerIds: string[],
  access: ViewerAccess,
) {
  const place = origin
    ? `${origin.latitude.toFixed(ORIGIN_PRECISION)},${origin.longitude.toFixed(ORIGIN_PRECISION)}`
    : "";

  return `personal-rails:${viewerId ?? "front-of-house"}:${place}:${accessTier(access)}:${providerIds.toSorted().join(",")}`;
}

export async function getPersonalRails(
  env: Bindings,
  viewerId: string | null,
  origin: ViewerOrigin | null,
  access: ViewerAccess,
): Promise<DeliveredRail[]> {
  try {
    const [preferences, providerIds] = viewerId
      ? await Promise.all([
          readNotebookPreferences(env.DB, viewerId),
          readProviderPreferences(env.DB, viewerId),
        ])
      : [null, null];
    const language = preferences?.preferredLanguage ?? "en";

    return await withKvCache(
      env,
      personalCacheKey(viewerId, origin, providerIds ?? [], access),
      PERSONAL_CACHE_SECONDS,
      async () => {
        const [people, cinema] = await Promise.all([
          viewerId
            ? peopleRails(env, viewerId, language, providerIds ?? [], access)
            : Promise.resolve([]),
          cinemaRail(
            env,
            origin,
            {
              cinemaId: preferences?.preferredCinemaId ?? null,
              cinemaName: preferences?.preferredCinemaName ?? null,
              location: preferences?.preferredLocation ?? "",
              language,
              required: Boolean(viewerId),
            },
            access,
          ),
        ]);

        return [...people, cinema].filter((rail): rail is DeliveredRail => rail !== null);
      },
    );
  } catch (error) {
    logError("personal_rails_failed", error, { area: "catalogue" });

    return [];
  }
}

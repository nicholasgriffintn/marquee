import type { SectionAudience } from "../../src/domain/catalog.ts";
import { providerRegistry } from "../../src/domain/providers.ts";
import { anniversaryCaption, anniversaryQuery } from "../lib/anniversary.ts";
import { PALME_DOR } from "../lib/awards.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { titleCase } from "../lib/text.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { ACADEMY_RATIO, BLACK_AND_WHITE } from "../lib/visual-format.ts";
import type { Bindings } from "../types.ts";

const POOL_SIZE = 40;
const OVERFETCH = 140;
const MIN_SECTION = 6;
const MAX_SECTIONS = 32;
const REPEAT_WINDOW = 4;
const ROTATING_GENRES = 3;
const ROTATING_MOODS = 2;
const ROTATING_STUDIOS = 2;
const SERVICE_ROWS = 10;

const JUNK_KEYWORDS = new Set(["duringcreditsstinger", "aftercreditsstinger", "woman director"]);

type Section = {
  id: string;
  title: string;
  description: string;
  titleIds: string[];
  audience?: SectionAudience;
};

const SCORE = "blended_rating";
const VOTES = "vote_count";
const RUNTIME = "runtime_minutes";
const SEASONS = "number_of_seasons";
const CERT = "COALESCE(certification, '')";
const STATUS = "COALESCE(status, '')";
const LANGUAGE = "COALESCE(original_language, '')";
const REVENUE = "COALESCE(revenue, 0)";
const AWARD_WINS = `max(
  COALESCE((SELECT award_wins FROM catalog_title_ratings WHERE title_id = catalog_titles.id), 0),
  (SELECT count(DISTINCT award_id || '/' || ceremony_year) FROM title_awards
    WHERE title_id = catalog_titles.id AND outcome = 'won')
)`;
const NOMINATIONS = `(SELECT count(DISTINCT award_id || '/' || ceremony_year) FROM title_awards
  WHERE title_id = catalog_titles.id AND outcome = 'nominated')`;
const WON_NOTHING = `NOT EXISTS (SELECT 1 FROM title_awards
  WHERE title_id = catalog_titles.id AND outcome = 'won')`;

function dailySeed() {
  return Math.floor(Date.now() / 86_400_000);
}

function rotate<T>(values: T[], count: number, offset: number) {
  if (values.length <= count) {
    return values;
  }

  return Array.from(
    { length: count },
    (_, index) => values[(offset + index) % values.length],
  ).filter((value): value is T => value !== undefined);
}

async function pick(
  env: Bindings,
  used: Set<string>,
  where: string,
  order: string,
  bindings: unknown[] = [],
) {
  const rows = await env.DB.prepare(
    `SELECT id FROM catalog_titles WHERE ${where} ORDER BY ${order} LIMIT ${OVERFETCH}`,
  )
    .bind(...bindings)
    .all<{ id: string }>();

  return rows.results
    .map((row) => row.id)
    .filter((id) => isKnownTitle(id) && !used.has(id))
    .slice(0, POOL_SIZE);
}

async function scheduled(env: Bindings, used: Set<string>) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT s.title_id AS id
     FROM title_schedule AS s
     JOIN catalog_titles AS t ON t.id = s.title_id
     WHERE s.airs_at BETWEEN datetime('now', '-6 hours') AND datetime('now', '+7 days')
     ORDER BY t.popularity DESC
     LIMIT ${OVERFETCH}`,
  ).all<{ id: string }>();

  return rows.results
    .map((row) => row.id)
    .filter((id) => isKnownTitle(id) && !used.has(id))
    .slice(0, POOL_SIZE);
}

async function anniversaries(env: Bindings, used: Set<string>) {
  const query = anniversaryQuery(new Date());
  const rows = await env.DB.prepare(
    `SELECT id, year FROM catalog_titles
     WHERE ${query.where} AND ${SCORE} >= 6.2 AND ${VOTES} >= 60
     ORDER BY ${query.order}, ${SCORE} DESC
     LIMIT ${OVERFETCH}`,
  )
    .bind(...query.binds)
    .all<{ id: string; year: number }>();

  const picked = rows.results
    .filter((row) => isKnownTitle(row.id) && !used.has(row.id))
    .slice(0, POOL_SIZE);

  return {
    titleIds: picked.map((row) => row.id),
    years: [...new Set(picked.map((row) => row.year))],
  };
}

async function topValues(
  env: Bindings,
  table: "catalog_title_genres" | "catalog_title_keywords",
  column: "genre" | "keyword",
  minimum: number,
  limit: number,
) {
  const rows = await env.DB.prepare(
    `SELECT ${column} AS value, count(*) AS uses
     FROM ${table}
     GROUP BY ${column}
     HAVING uses >= ?
     ORDER BY uses DESC
     LIMIT ?`,
  )
    .bind(minimum, limit)
    .all<{ value: unknown; uses: number }>();

  return rows.results
    .map((row) => row.value)
    .filter((value): value is string => typeof value === "string" && value.length > 1);
}

async function topStudios(env: Bindings, limit: number): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT s.studio AS value, count(*) AS uses
     FROM catalog_title_studios AS s
     JOIN catalog_titles AS t ON t.id = s.title_id
     WHERE t.${SCORE} >= 6.5
     GROUP BY s.studio
     HAVING uses BETWEEN 8 AND 400
     ORDER BY uses DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{ value: string }>();

  return rows.results.map((row) => String(row.value)).filter((value) => value.length > 1);
}

async function cachedFacet<T>(
  env: Bindings,
  kind: string,
  generation: number,
  compute: () => Promise<T>,
): Promise<T> {
  const cached = await env.DB.prepare(
    `SELECT generation, payload FROM catalog_section_facet_cache WHERE kind = ?`,
  )
    .bind(kind)
    .first<{ generation: number; payload: string }>();

  if (cached && cached.generation === generation) {
    return JSON.parse(cached.payload) as T;
  }

  const value = await compute();

  await env.DB.prepare(
    `INSERT INTO catalog_section_facet_cache (kind, generation, payload, computed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(kind) DO UPDATE SET
       generation = excluded.generation,
       payload = excluded.payload,
       computed_at = excluded.computed_at`,
  )
    .bind(kind, generation, JSON.stringify(value), new Date().toISOString())
    .run();

  return value;
}

const PROVIDER_NAMES = new Map(providerRegistry.map((provider) => [provider.id, provider.name]));

async function topServices(env: Bindings, limit: number) {
  const rows = await env.DB.prepare(
    `SELECT provider_id AS providerId, count(DISTINCT title_id) AS uses
     FROM catalog_title_provider_offers
     WHERE offer_type = 'Subscription'
     GROUP BY provider_id
     HAVING uses >= 40
     ORDER BY uses DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{ providerId: string; uses: number }>();

  return rows.results.flatMap((row) => {
    const name = PROVIDER_NAMES.get(row.providerId);

    return name ? [{ id: row.providerId, name }] : [];
  });
}

export async function buildSections(env: Bindings) {
  const recent: Set<string>[] = [];
  const used = new Set<string>();
  const sections: Section[] = [];
  const seed = dailySeed();
  const year = new Date().getUTCFullYear();

  const add = (section: Section) => {
    if (section.titleIds.length < MIN_SECTION) {
      return;
    }

    sections.push(section);
    recent.push(new Set(section.titleIds));

    while (recent.length > REPEAT_WINDOW) {
      recent.shift();
    }

    used.clear();

    for (const window of recent) {
      for (const id of window) {
        used.add(id);
      }
    }
  };

  add({
    id: "on-this-week",
    title: "On this week",
    description: "Episodes landing over the next seven days",
    titleIds: await scheduled(env, used),
  });

  add({
    id: "fresh",
    title: "New this year",
    description: `Released in ${year}, most talked about first`,
    titleIds: await pick(env, used, `year >= ? AND ${VOTES} >= 40`, "popularity DESC", [year]),
  });

  const anniversary = await anniversaries(env, used);

  add({
    id: "anniversary",
    title: "Years ago this week",
    description: anniversaryCaption(anniversary.years),
    titleIds: anniversary.titleIds,
  });

  add({
    id: "gems",
    title: "Quietly brilliant",
    description: "Highly rated, and nowhere near enough people have seen them",
    titleIds: await pick(
      env,
      used,
      `${SCORE} >= 7.5 AND ${VOTES} BETWEEN 200 AND 3000`,
      `${SCORE} DESC`,
    ),
  });

  add({
    id: "short",
    title: "Home before ten",
    description: "Good films that finish inside an hour and forty",
    titleIds: await pick(
      env,
      used,
      `media_type = 'movie' AND ${RUNTIME} BETWEEN 60 AND 99 AND ${SCORE} >= 6.8 AND ${VOTES} >= 150`,
      `${SCORE} DESC`,
    ),
  });

  add({
    id: "binge",
    title: "Something to live in",
    description: "Series deep enough to disappear into",
    titleIds: await pick(
      env,
      used,
      `media_type = 'tv' AND ${SEASONS} >= 4 AND ${SCORE} >= 7.5 AND ${VOTES} >= 200`,
      "popularity DESC",
    ),
  });

  add({
    id: "archive",
    title: "Older, and worth it",
    description: "The best of the seventies through the nineties",
    titleIds: await pick(
      env,
      used,
      `year BETWEEN 1970 AND 1999 AND ${SCORE} >= 7.3 AND ${VOTES} >= 200`,
      `${SCORE} DESC`,
    ),
  });

  add({
    id: "black-and-white",
    title: "In black and white",
    description: "Shot without colour, whatever year they were made",
    titleIds: await pick(
      env,
      used,
      `id IN (SELECT title_id FROM title_visual_format WHERE kind = 'colour' AND value = ?)
       AND ${SCORE} >= 6.5 AND ${VOTES} >= 60`,
      `${SCORE} DESC`,
      [BLACK_AND_WHITE],
    ),
  });

  add({
    id: "academy-ratio",
    title: "Shot in Academy ratio",
    description: `The near-square ${ACADEMY_RATIO} frame, from before the screen got wider`,
    titleIds: await pick(
      env,
      used,
      `id IN (SELECT title_id FROM title_visual_format WHERE kind = 'aspect_ratio' AND value = ?)
       AND ${VOTES} >= 40`,
      `${SCORE} DESC`,
      [ACADEMY_RATIO],
    ),
  });

  add({
    id: "family",
    title: "Everyone in the room",
    description: "Rated for all ages, and actually good",
    titleIds: await pick(
      env,
      used,
      `(${CERT} LIKE '%U' OR ${CERT} LIKE '%PG' OR ${CERT} LIKE '%G' OR ${CERT} LIKE '%TV-Y%')
       AND ${SCORE} >= 6.8 AND ${VOTES} >= 150
       AND EXISTS (SELECT 1 FROM catalog_title_genres
                   WHERE title_id = catalog_titles.id
                     AND genre IN ('Family', 'Animation', 'Adventure'))`,
      "popularity DESC",
    ),
  });

  add({
    id: "ended",
    title: "Finished, all of it",
    description: "Series that have ended, so there is nothing left to wait for",
    titleIds: await pick(
      env,
      used,
      `media_type = 'tv' AND ${STATUS} = 'Ended' AND ${SEASONS} >= 2
       AND ${SCORE} >= 7.4 AND ${VOTES} >= 150`,
      `${SCORE} DESC`,
    ),
  });

  add({
    id: "subtitles",
    title: "Worth the subtitles",
    description: "The best of what was not made in English",
    titleIds: await pick(
      env,
      used,
      `${LANGUAGE} NOT IN ('', 'en') AND ${SCORE} >= 7.2 AND ${VOTES} >= 250`,
      `${SCORE} DESC`,
    ),
  });

  add({
    id: "awarded",
    title: "The trophy cabinet",
    description: "Films and series the awards season could not ignore",
    titleIds: await pick(env, used, `${AWARD_WINS} >= 8 AND ${VOTES} >= 150`, `${AWARD_WINS} DESC`),
  });

  add({
    id: "palme-dor",
    title: "The Palme d'Or",
    description: "Every winner Cannes has crowned that we have in the catalogue",
    titleIds: await pick(
      env,
      used,
      `EXISTS (SELECT 1 FROM title_awards AS ta
               JOIN awards AS a ON a.award_id = ta.award_id
               WHERE ta.title_id = catalog_titles.id
                 AND a.wikidata_id = '${PALME_DOR}' AND ta.outcome = 'won')`,
      "year DESC",
    ),
  });

  add({
    id: "always-a-bridesmaid",
    title: "Always the bridesmaid",
    description: "Nominated again and again, and sent home with nothing",
    titleIds: await pick(
      env,
      used,
      `${NOMINATIONS} >= 3 AND ${WON_NOTHING} AND ${VOTES} >= 100`,
      `${NOMINATIONS} DESC`,
    ),
  });

  add({
    id: "adaptations",
    title: "The same story, again",
    description: "Books, plays and films the screen keeps coming back to",
    titleIds: await pick(
      env,
      used,
      `${VOTES} >= 60
       AND EXISTS (
         SELECT 1 FROM title_source_works AS link
          WHERE link.title_id = catalog_titles.id
            AND (SELECT count(*) FROM title_source_works AS peer
                  WHERE peer.work_entity_id = link.work_entity_id) >= 2
       )`,
      "popularity DESC",
    ),
  });

  add({
    id: "boxoffice",
    title: "Everyone went to see it",
    description: "The films that filled cinemas, by what they took",
    titleIds: await pick(
      env,
      used,
      `media_type = 'movie' AND ${REVENUE} >= 250000000 AND ${SCORE} >= 6.5`,
      `${REVENUE} DESC`,
    ),
  });

  for (const service of await cachedFacet(env, "services", seed, () =>
    topServices(env, SERVICE_ROWS),
  )) {
    const audience = { providerIds: [service.id] };
    const slug = service.id.replaceAll(/\W+/gu, "-");

    // oxlint-disable-next-line no-await-in-loop
    const landed = await pick(
      env,
      used,
      `${SCORE} >= 6.2
       AND EXISTS (
         SELECT 1 FROM title_provider_state AS state
          WHERE state.title_id = catalog_titles.id
            AND state.provider_id = ?
            AND state.offer_kind = 'streaming'
            AND julianday(state.first_seen_at) > julianday('now', '-45 days')
       )`,
      "popularity DESC",
      [service.id],
    );

    add({
      id: `service-new-${slug}`,
      title: `Just landed on ${service.name}`,
      description: `Turned up on ${service.name} in the last few weeks`,
      titleIds: landed,
      audience,
    });

    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await pick(
      env,
      used,
      `${SCORE} >= 6.8 AND ${VOTES} >= 120
       AND EXISTS (SELECT 1 FROM catalog_title_providers
                   WHERE title_id = catalog_titles.id AND provider_id = ?)`,
      "popularity DESC",
      [service.id],
    );

    add({
      id: `service-${slug}`,
      title: `Sitting on ${service.name}`,
      description: `Well reviewed titles you can already stream on ${service.name}`,
      titleIds,
      audience,
    });
  }

  for (const studio of await cachedFacet(env, "studios", seed, () => topStudios(env, 24)).then(
    (studios) => rotate(studios, ROTATING_STUDIOS, seed * 11),
  )) {
    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await pick(
      env,
      used,
      `${SCORE} >= 6.8 AND ${VOTES} >= 100
       AND EXISTS (SELECT 1 FROM catalog_title_studios
                   WHERE title_id = catalog_titles.id AND studio = ?)`,
      `${SCORE} DESC`,
      [studio],
    );

    add({
      id: `studio-${studio.toLowerCase().replaceAll(/\W+/gu, "-")}`,
      title: `Made by ${studio}`,
      description: `The strongest of what ${studio} has put out`,
      titleIds,
    });
  }

  const genres = await cachedFacet(env, "genres", seed, () =>
    topValues(env, "catalog_title_genres", "genre", 200, 16),
  );

  for (const genre of rotate(genres, ROTATING_GENRES, seed)) {
    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await pick(
      env,
      used,
      `${SCORE} >= 6.8 AND ${VOTES} >= 200
       AND EXISTS (SELECT 1 FROM catalog_title_genres
                   WHERE title_id = catalog_titles.id AND genre = ?)`,
      "popularity DESC",
      [genre],
    );

    add({
      id: `genre-${genre.toLowerCase().replaceAll(/\W+/gu, "-")}`,
      title: genre,
      description: `Well reviewed ${genre.toLowerCase()}, by how much people are watching`,
      titleIds,
    });
  }

  const moods: string[] = (
    await cachedFacet(env, "keywords", seed, () =>
      topValues(env, "catalog_title_keywords", "keyword", 60, 40),
    )
  ).filter((keyword) => !JUNK_KEYWORDS.has(keyword) && !keyword.startsWith("based on"));

  for (const mood of rotate(moods, ROTATING_MOODS, seed * 7)) {
    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await pick(
      env,
      used,
      `${SCORE} >= 6.5 AND ${VOTES} >= 120
       AND EXISTS (SELECT 1 FROM catalog_title_keywords
                   WHERE title_id = catalog_titles.id AND keyword = ?)`,
      `${SCORE} DESC`,
      [mood],
    );

    add({
      id: `mood-${mood.replaceAll(/\W+/gu, "-")}`,
      title: titleCase(mood),
      description: `Tagged ${mood} across the catalogue`,
      titleIds,
    });
  }

  if (sections.length === 0) {
    logError("sections_empty", new Error("no section met the minimum size"));

    return 0;
  }

  const chosen = sections.slice(0, MAX_SECTIONS);
  const fetchedAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM catalog_sections`),
    ...chosen.map((section) =>
      env.DB.prepare(
        `INSERT INTO catalog_sections
           (id, title, description, title_ids, source_updated_at, audience)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        section.id,
        section.title,
        section.description,
        JSON.stringify(section.titleIds),
        fetchedAt,
        JSON.stringify(section.audience ?? {}),
      ),
    ),
  ]);

  logEvent("sections_built", {
    sections: chosen.length,
    gated: chosen.filter((section) => section.audience?.providerIds?.length).length,
    titles: chosen.reduce((total, section) => total + section.titleIds.length, 0),
  });

  return chosen.length;
}

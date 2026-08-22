import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import type { Bindings } from "../types.ts";

const SECTION_SIZE = 14;
const OVERFETCH = 60;
const MIN_SECTION = 6;
const MAX_SECTIONS = 14;
const ROTATING_GENRES = 3;
const ROTATING_MOODS = 3;

const JUNK_KEYWORDS = ["duringcreditsstinger", "aftercreditsstinger", "woman director"];

type Section = { id: string; title: string; description: string; titleIds: string[] };

const SCORE = `COALESCE(json_extract(payload, '$.tmdbScore'), 0)`;
const VOTES = `COALESCE(json_extract(payload, '$.tmdbVoteCount'), 0)`;
const RUNTIME = `json_extract(payload, '$.runtimeMinutes')`;
const SEASONS = `json_extract(payload, '$.numberOfSeasons')`;
const CERT = `COALESCE(json_extract(payload, '$.certification'), '')`;

function titleCase(value: string) {
  return value.replaceAll(/\b\w/gu, (character) => character.toUpperCase());
}

function dailySeed() {
  return Math.floor(Date.now() / 86_400_000);
}

function rotate<T>(values: T[], count: number, offset: number) {
  if (values.length <= count) {
    return values;
  }

  return Array.from({ length: count }, (_, index) => values[(offset + index) % values.length]);
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
    .slice(0, SECTION_SIZE);
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
    .slice(0, SECTION_SIZE);
}

async function topValues(env: Bindings, path: string, minimum: number, limit: number) {
  const rows = await env.DB.prepare(
    `SELECT json_each.value AS value, count(*) AS uses
     FROM catalog_titles, json_each(payload, ?)
     GROUP BY json_each.value
     HAVING uses >= ?
     ORDER BY uses DESC
     LIMIT ?`,
  )
    .bind(path, minimum, limit)
    .all<{ value: string; uses: number }>();

  return rows.results
    .map((row) => row.value)
    .filter((value) => typeof value === "string" && value.length > 1);
}

export async function buildSections(env: Bindings) {
  const used = new Set<string>();
  const sections: Section[] = [];
  const seed = dailySeed();
  const year = new Date().getUTCFullYear();

  const add = (section: Section) => {
    if (section.titleIds.length >= MIN_SECTION) {
      sections.push(section);

      for (const id of section.titleIds) {
        used.add(id);
      }
    }
  };

  add({
    id: "airing",
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
    id: "family",
    title: "Everyone in the room",
    description: "Rated for all ages, and actually good",
    titleIds: await pick(
      env,
      used,
      `(${CERT} LIKE '%U' OR ${CERT} LIKE '%PG' OR ${CERT} LIKE '%G' OR ${CERT} LIKE '%TV-Y%')
       AND ${SCORE} >= 6.8 AND ${VOTES} >= 150
       AND EXISTS (SELECT 1 FROM json_each(payload, '$.genres')
                   WHERE json_each.value IN ('Family', 'Animation', 'Adventure'))`,
      "popularity DESC",
    ),
  });

  const genres = await topValues(env, "$.genres", 200, 16);

  for (const genre of rotate(genres, ROTATING_GENRES, seed)) {
    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await pick(
      env,
      used,
      `${SCORE} >= 6.8 AND ${VOTES} >= 200
       AND EXISTS (SELECT 1 FROM json_each(payload, '$.genres') WHERE json_each.value = ?)`,
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

  const moods = (await topValues(env, "$.keywords", 60, 40)).filter(
    (keyword) => !JUNK_KEYWORDS.includes(keyword) && !keyword.startsWith("based on"),
  );

  for (const mood of rotate(moods, ROTATING_MOODS, seed * 7)) {
    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await pick(
      env,
      used,
      `${SCORE} >= 6.5 AND ${VOTES} >= 120
       AND EXISTS (SELECT 1 FROM json_each(payload, '$.keywords') WHERE json_each.value = ?)`,
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
        `INSERT INTO catalog_sections (id, title, description, title_ids, source_updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        section.id,
        section.title,
        section.description,
        JSON.stringify(section.titleIds),
        fetchedAt,
      ),
    ),
  ]);

  console.log(
    JSON.stringify({
      event: "sections_built",
      sections: chosen.length,
      titles: chosen.reduce((total, section) => total + section.titleIds.length, 0),
    }),
  );

  return chosen.length;
}

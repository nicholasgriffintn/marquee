import type { AnimeStream, AnimeTheme, AnimeVideo, MediaTitle } from "../../src/domain/catalog.ts";
import { deleteByTitleIds, groupBy, insertRows, queryChunked } from "./catalog-array-utils.ts";

export async function readAnimeStreamMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, site, url FROM catalog_title_anime_streams
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, position`,
      )
      .bind(...wave)
      .all<AnimeStream & { titleId: string }>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, AnimeStream[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...s }) => s),
    );
  }

  return values;
}

export async function writeAnimeStreamRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_streams",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.streams ?? []).map((stream, position): unknown[] => [
      title.id,
      stream.site,
      stream.url,
      position,
    ]),
  );

  await insertRows(
    db,
    4,
    22,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_streams (title_id, site, url, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
  );
}

type ThemeRow = AnimeTheme & { titleId: string; kind: "opening" | "ending" };

export async function readAnimeThemeMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, kind, title, artist, episodes
         FROM catalog_title_anime_themes
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, kind, position`,
      )
      .bind(...wave)
      .all<ThemeRow>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, { openings: AnimeTheme[]; endings: AnimeTheme[] }>();

  for (const [titleId, entries] of grouped) {
    values.set(titleId, {
      openings: entries
        .filter((entry) => entry.kind === "opening")
        .map(({ titleId: _t, kind: _k, ...theme }) => theme),
      endings: entries
        .filter((entry) => entry.kind === "ending")
        .map(({ titleId: _t, kind: _k, ...theme }) => theme),
    });
  }

  return values;
}

export async function writeAnimeThemeRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_themes",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) => [
    ...(title.anime?.openings ?? []).map((theme, position): unknown[] => [
      title.id,
      "opening",
      theme.title,
      theme.artist,
      theme.episodes,
      position,
    ]),
    ...(title.anime?.endings ?? []).map((theme, position): unknown[] => [
      title.id,
      "ending",
      theme.title,
      theme.artist,
      theme.episodes,
      position,
    ]),
  ]);

  await insertRows(
    db,
    6,
    15,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_themes (title_id, kind, title, artist, episodes, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
  );
}

export async function readAnimeVideoMap(db: D1Database, ids: string[]) {
  const rows = await queryChunked(ids, (wave) =>
    db
      .prepare(
        `SELECT title_id AS titleId, video_key AS key, name FROM catalog_title_anime_videos
         WHERE title_id IN (${wave.map(() => "?").join(",")}) ORDER BY title_id, position`,
      )
      .bind(...wave)
      .all<AnimeVideo & { titleId: string }>()
      .then((r) => r.results),
  );
  const grouped = groupBy(rows, (r) => r.titleId);
  const values = new Map<string, AnimeVideo[]>();

  for (const [titleId, entries] of grouped) {
    values.set(
      titleId,
      entries.map(({ titleId: _t, ...v }) => v),
    );
  }

  return values;
}

export async function writeAnimeVideoRows(db: D1Database, titles: MediaTitle[]) {
  await deleteByTitleIds(
    db,
    "catalog_title_anime_videos",
    titles.map((title) => title.id),
  );

  const rows = titles.flatMap((title) =>
    (title.anime?.videos ?? []).map((video, position): unknown[] => [
      title.id,
      video.key,
      video.name,
      position,
    ]),
  );

  await insertRows(
    db,
    4,
    22,
    rows,
    (chunk) =>
      `INSERT OR IGNORE INTO catalog_title_anime_videos (title_id, video_key, name, position)
       VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}`,
  );
}

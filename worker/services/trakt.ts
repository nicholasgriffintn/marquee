import { getItems } from "../clients/tmdb.ts";
import {
  getTraktCalendar,
  getTraktRatings,
  getTraktWatched,
  getTraktWatchlist,
  pushTraktHistory,
  pushTraktRatings,
  pushTraktWatchlist,
  refreshTraktTokens,
  TraktError,
  type TraktEntry,
  type TraktPushItem,
} from "../clients/trakt.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { databaseDate } from "../lib/values.ts";
import { storeItems } from "../repositories/catalog-writer.ts";
import {
  markLinkBroken,
  markLinkPushed,
  markLinkSynced,
  readLink,
  readPushedAt,
  saveLink,
} from "../repositories/links.ts";
import type { Bindings, EntryStatus } from "../types.ts";

const IMPORT_LIMIT = 400;
const PUSH_LIMIT = 400;
const PUSH_CHUNK = 100;
const HYDRATE_LIMIT = 120;

export function traktRedirectUri(origin: string) {
  return `${origin}/api/links/trakt/callback`;
}

async function traktAccessToken(env: Bindings, viewerId: string, origin: string) {
  const link = await readLink(env, viewerId, "trakt");

  if (!link) {
    return null;
  }

  const expiresAt = link.expiresAt ? Date.parse(link.expiresAt) : Number.NaN;
  const isExpiring = Number.isFinite(expiresAt) && expiresAt - Date.now() < 300_000;

  if (!isExpiring || !link.refreshToken) {
    return link.accessToken;
  }

  try {
    const refreshed = await refreshTraktTokens(env, link.refreshToken, traktRedirectUri(origin));

    await saveLink(env, viewerId, "trakt", refreshed, link.accountLabel);

    return refreshed.accessToken;
  } catch (error) {
    logError("trakt_refresh_failed", error, { viewerId });

    if (error instanceof TraktError && [400, 401, 403].includes(error.status)) {
      await markLinkBroken(env, viewerId, "trakt");
    }

    return link.accessToken;
  }
}

function titleIdOf(entry: TraktEntry) {
  const titleId = `${entry.mediaType}:${entry.tmdbId}`;

  return isKnownTitle(titleId) ? titleId : null;
}

function marqueeRating(rating: number | null) {
  return rating === null ? null : clamp(Math.round(rating / 2), 1, 5);
}

type Planned = { titleId: string; status: EntryStatus; rating: number | null };

function plan(watched: TraktEntry[], watchlist: TraktEntry[], ratings: TraktEntry[]) {
  const planned = new Map<string, Planned>();

  for (const entry of watchlist) {
    const titleId = titleIdOf(entry);

    if (titleId) {
      planned.set(titleId, { titleId, status: "watchlist", rating: null });
    }
  }

  for (const entry of watched) {
    const titleId = titleIdOf(entry);

    if (titleId) {
      planned.set(titleId, {
        titleId,
        status: entry.mediaType === "tv" ? "watching" : "watched",
        rating: planned.get(titleId)?.rating ?? null,
      });
    }
  }

  for (const entry of ratings) {
    const titleId = titleIdOf(entry);
    const rating = marqueeRating(entry.rating);

    if (!titleId || rating === null) {
      continue;
    }

    const existing = planned.get(titleId);

    planned.set(titleId, {
      titleId,
      status: existing?.status ?? "watched",
      rating,
    });
  }

  return [...planned.values()].slice(0, IMPORT_LIMIT);
}

async function hydrateMissing(env: Bindings, titleIds: string[]) {
  if (titleIds.length === 0) {
    return;
  }

  const known = await env.DB.query<{ id: string }>(
    `SELECT id FROM catalog_titles WHERE id IN (SELECT value FROM jsonb_array_elements_text(CAST($1 AS jsonb)) AS entries(value))`,
    [JSON.stringify(titleIds)],
  );
  const have = new Set(known.rows.map((row) => row.id));
  const missing = titleIds.filter((titleId) => !have.has(titleId)).slice(0, HYDRATE_LIMIT);

  if (missing.length === 0) {
    return;
  }

  const titles = await getItems(env, missing);

  await storeItems(env.DB, titles, new Date().toISOString());

  logEvent("trakt_titles_hydrated", { count: titles.length });
}

export async function importTraktHistory(env: Bindings, viewerId: string, origin: string) {
  const accessToken = await traktAccessToken(env, viewerId, origin);

  if (!accessToken) {
    throw new TraktError("Trakt is not linked for this viewer", 400);
  }

  const [watched, watchlist, ratings] = await Promise.all([
    getTraktWatched(env, accessToken),
    getTraktWatchlist(env, accessToken),
    getTraktRatings(env, accessToken),
  ]);
  const planned = plan(watched, watchlist, ratings);

  await hydrateMissing(
    env,
    planned.map((entry) => entry.titleId),
  );

  if (planned.length === 0) {
    await markLinkSynced(env, viewerId, "trakt");

    return 0;
  }

  await env.DB.transaction(async (transaction) => {
    for (const entry of planned) {
      // oxlint-disable-next-line no-await-in-loop
      await transaction.execute(
        `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts)
         VALUES ($1, $2, $3, $4, $5, '')
         ON CONFLICT(viewer_id, title_id) DO UPDATE SET
           status = excluded.status,
           rating = COALESCE(excluded.rating, viewing_entries.rating),
           updated_at = CURRENT_TIMESTAMP`,
        [crypto.randomUUID(), viewerId, entry.titleId, entry.status, entry.rating],
      );
    }
  });

  await markLinkSynced(env, viewerId, "trakt");

  logEvent("trakt_history_imported", { entries: planned.length });

  return planned.length;
}

export async function traktUpcoming(env: Bindings, viewerId: string, origin: string) {
  const accessToken = await traktAccessToken(env, viewerId, origin);

  if (!accessToken) {
    return [];
  }

  try {
    return await getTraktCalendar(env, accessToken, 7);
  } catch (error) {
    logError("trakt_calendar_failed", error, { viewerId });

    return [];
  }
}

type ShelfRow = {
  titleId: string;
  status: EntryStatus;
  rating: number | null;
  updatedAt: string;
};

function pushItem(row: ShelfRow): TraktPushItem | null {
  const [mediaType, tmdbId] = row.titleId.split(":");
  const numeric = Number(tmdbId);

  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isInteger(numeric)) {
    return null;
  }

  return { tmdbId: numeric, mediaType };
}

function chunked<T>(items: T[], size = PUSH_CHUNK) {
  const waves: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    waves.push(items.slice(index, index + size));
  }

  return waves;
}

async function pushWaves(items: TraktPushItem[], send: (wave: TraktPushItem[]) => Promise<number>) {
  let total = 0;

  for (const wave of chunked(items)) {
    // oxlint-disable-next-line no-await-in-loop
    total += await send(wave);
  }

  return total;
}

export async function exportTraktShelf(env: Bindings, viewerId: string, origin: string) {
  const accessToken = await traktAccessToken(env, viewerId, origin);

  if (!accessToken) {
    throw new TraktError("Trakt is not linked for this viewer", 400);
  }

  const pushedAt = await readPushedAt(env, viewerId, "trakt");
  const rows = await env.DB.query<ShelfRow>(
    `SELECT title_id AS "titleId", status, rating, updated_at AS "updatedAt"
       FROM viewing_entries
      WHERE viewer_id = $1
        AND ($2::timestamptz IS NULL OR updated_at > $2::timestamptz)
      ORDER BY updated_at, id
      LIMIT ${PUSH_LIMIT}`,
    [viewerId, pushedAt],
  );
  const page = rows.rows;
  const boundary = page.at(-1)?.updatedAt;
  const trimmed =
    page.length === PUSH_LIMIT && boundary
      ? page.filter((row) => row.updatedAt !== boundary)
      : page;
  const pushable = trimmed.length > 0 ? trimmed : page;
  const history: TraktPushItem[] = [];
  const ratings: TraktPushItem[] = [];
  const watchlist: TraktPushItem[] = [];

  for (const row of pushable) {
    const item = pushItem(row);

    if (!item) {
      continue;
    }

    if (row.status === "watched") {
      history.push({
        ...item,
        watchedAt: databaseDate(row.updatedAt).toISOString(),
      });
    } else if (row.status === "watchlist" || row.status === "watching") {
      watchlist.push(item);
    }

    if (row.rating) {
      ratings.push({ ...item, rating: clamp(row.rating * 2, 1, 10) });
    }
  }

  const rated = await pushWaves(ratings, (wave) => pushTraktRatings(env, accessToken, wave));
  const listed = await pushWaves(watchlist, (wave) => pushTraktWatchlist(env, accessToken, wave));
  const watched = await pushWaves(history, (wave) => pushTraktHistory(env, accessToken, wave));

  const maxUpdatedAt = pushable.at(-1)?.updatedAt;

  if (maxUpdatedAt) {
    await markLinkPushed(env, viewerId, "trakt", maxUpdatedAt);
  }

  logEvent("trakt_shelf_pushed", { watched, rated, listed });

  return { watched, rated, listed, considered: rows.rows.length };
}

export async function traktPushPreview(env: Bindings, viewerId: string) {
  const pushedAt = await readPushedAt(env, viewerId, "trakt");
  const row = await env.DB.first<{
    watched: number | null;
    listed: number | null;
    rated: number | null;
  }>(
    `SELECT
       sum(CASE WHEN status = 'watched' THEN 1 ELSE 0 END) AS watched,
       sum(CASE WHEN status IN ('watchlist', 'watching') THEN 1 ELSE 0 END) AS listed,
       sum(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END) AS rated
     FROM viewing_entries
     WHERE viewer_id = $1
       AND ($2::timestamptz IS NULL OR updated_at > $2::timestamptz)`,
    [viewerId, pushedAt],
  );

  return {
    pushedAt,
    watched: row?.watched ?? 0,
    listed: row?.listed ?? 0,
    rated: row?.rated ?? 0,
  };
}

import { getItems } from "../clients/tmdb.ts";
import {
  getTraktCalendar,
  getTraktRatings,
  getTraktWatched,
  getTraktWatchlist,
  refreshTraktTokens,
  TraktError,
  type TraktEntry,
} from "../clients/trakt.ts";
import { logError } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import { storeItems } from "../repositories/catalog-writer.ts";
import { markLinkSynced, readLink, saveLink } from "../repositories/links.ts";
import type { Bindings, EntryStatus } from "../types.ts";

const IMPORT_LIMIT = 400;
const HYDRATE_LIMIT = 120;

export function traktRedirectUri(origin: string) {
  return `${origin}/api/links/trakt/callback`;
}

export async function traktAccessToken(env: Bindings, viewerId: string, origin: string) {
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

    return link.accessToken;
  }
}

function titleIdOf(entry: TraktEntry) {
  const titleId = `${entry.mediaType}:${entry.tmdbId}`;

  return isKnownTitle(titleId) ? titleId : null;
}

function marqueeRating(rating: number | null) {
  return rating === null ? null : Math.max(1, Math.min(5, Math.round(rating / 2)));
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

  const placeholders = titleIds.map(() => "?").join(", ");
  const known = await env.DB.prepare(`SELECT id FROM catalog_titles WHERE id IN (${placeholders})`)
    .bind(...titleIds)
    .all<{ id: string }>();
  const have = new Set(known.results.map((row) => row.id));
  const missing = titleIds.filter((titleId) => !have.has(titleId)).slice(0, HYDRATE_LIMIT);

  if (missing.length === 0) {
    return;
  }

  const titles = await getItems(env, missing);

  await storeItems(env.DB, titles, new Date().toISOString());

  console.log(JSON.stringify({ event: "trakt_titles_hydrated", count: titles.length }));
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

  await env.DB.batch(
    planned.map((entry) =>
      env.DB.prepare(
        `INSERT INTO viewing_entries (id, viewer_id, title_id, status, rating, thoughts)
         VALUES (?, ?, ?, ?, ?, '')
         ON CONFLICT(viewer_id, title_id) DO UPDATE SET
           status = excluded.status,
           rating = COALESCE(excluded.rating, viewing_entries.rating),
           updated_at = CURRENT_TIMESTAMP`,
      ).bind(crypto.randomUUID(), viewerId, entry.titleId, entry.status, entry.rating),
    ),
  );

  await markLinkSynced(env, viewerId, "trakt");

  console.log(JSON.stringify({ event: "trakt_history_imported", entries: planned.length }));

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

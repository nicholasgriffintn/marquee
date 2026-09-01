import { IMPORT_RECORD_LIMIT, type ImportedActivity } from "../../src/domain/imports.ts";
import {
  getTraktCalendar,
  getTraktHistory,
  getTraktRatings,
  getTraktWatchlist,
  pushTraktHistory,
  pushTraktRatings,
  pushTraktWatchlist,
  refreshTraktTokens,
  TraktError,
  type TraktPushItem,
} from "../clients/trakt.ts";
import { sha256Hex } from "../lib/hash.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { clamp } from "../lib/numbers.ts";
import { databaseDate } from "../lib/values.ts";
import {
  createImportRun,
  stageImportRecords,
  transitionImportRun,
} from "../repositories/import-runs.ts";
import {
  markLinkBroken,
  markLinkPushed,
  markLinkSynced,
  readLink,
  readPushedAt,
  saveLink,
} from "../repositories/links.ts";
import type { Bindings, EntryStatus } from "../types.ts";

const PUSH_LIMIT = 400;
const PUSH_CHUNK = 100;
const IMPORT_CHUNK = 100;

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

function marqueeRating(rating: number | null) {
  return rating === null ? null : clamp(Math.round(rating / 2), 1, 5);
}

function traktRecords(
  history: Awaited<ReturnType<typeof getTraktHistory>>,
  watchlist: Awaited<ReturnType<typeof getTraktWatchlist>>,
  ratings: Awaited<ReturnType<typeof getTraktRatings>>,
) {
  const titledStatus = new Set(
    [...history, ...watchlist].map((entry) => `${entry.mediaType}:${entry.tmdbId}`),
  );
  const watched: ImportedActivity[] = history.map((entry) => ({
    source: "trakt",
    sourceSubject: "",
    sourceEventId: `history:${entry.id}`,
    eventTypes: ["watched"],
    providerItemId: `${entry.mediaType}:${entry.tmdbId}`,
    mediaType: entry.mediaType,
    title: entry.title.slice(0, 160),
    externalIds: {
      tmdb: entry.tmdbId,
      ...(entry.imdbId ? { imdb: entry.imdbId } : {}),
    },
    ...(entry.season !== null ? { season: entry.season } : {}),
    ...(entry.episode !== null ? { episode: entry.episode } : {}),
    ...(entry.watchedAt ? { watchedAt: entry.watchedAt } : {}),
  }));
  const listed: ImportedActivity[] = watchlist.map((entry) => ({
    source: "trakt",
    sourceSubject: "",
    sourceEventId: `watchlist:${entry.mediaType}:${entry.tmdbId}:${entry.listedAt ?? ""}`,
    eventTypes: ["watchlist"],
    providerItemId: `${entry.mediaType}:${entry.tmdbId}`,
    mediaType: entry.mediaType,
    title: entry.title.slice(0, 160),
    externalIds: {
      tmdb: entry.tmdbId,
      ...(entry.imdbId ? { imdb: entry.imdbId } : {}),
    },
  }));
  const rated: ImportedActivity[] = ratings.flatMap((entry): ImportedActivity[] => {
    const rating = marqueeRating(entry.rating);

    return rating === null
      ? []
      : [
          {
            source: "trakt",
            sourceSubject: "",
            sourceEventId: `rating:${entry.mediaType}:${entry.tmdbId}:${entry.ratedAt ?? ""}`,
            eventTypes: titledStatus.has(`${entry.mediaType}:${entry.tmdbId}`)
              ? ["rated"]
              : ["watched", "rated"],
            providerItemId: `${entry.mediaType}:${entry.tmdbId}`,
            mediaType: entry.mediaType,
            title: entry.title.slice(0, 160),
            externalIds: {
              tmdb: entry.tmdbId,
              ...(entry.imdbId ? { imdb: entry.imdbId } : {}),
            },
            ...(entry.ratedAt ? { watchedAt: entry.ratedAt } : {}),
            rating,
          },
        ];
  });

  return [...watched, ...listed, ...rated];
}

export async function importTraktHistory(env: Bindings, viewerId: string, origin: string) {
  const accessToken = await traktAccessToken(env, viewerId, origin);

  if (!accessToken) {
    throw new TraktError("Trakt is not linked for this viewer", 400);
  }

  const [history, watchlist, ratings] = await Promise.all([
    getTraktHistory(env, accessToken),
    getTraktWatchlist(env, accessToken),
    getTraktRatings(env, accessToken),
  ]);
  const records = traktRecords(history, watchlist, ratings);

  if (records.length > IMPORT_RECORD_LIMIT) {
    throw new TraktError(
      `That Trakt account contains more than ${IMPORT_RECORD_LIMIT.toLocaleString()} importable activities.`,
      400,
    );
  }

  if (records.length === 0) {
    await markLinkSynced(env, viewerId, "trakt");

    return null;
  }

  const run = await createImportRun(env.DB, viewerId, {
    source: "trakt",
    sourceSubject: "",
    inputKind: "connected_api",
    adapterId: "trakt-sync-api",
    adapterVersion: 1,
    inputFingerprint: await sha256Hex(crypto.randomUUID()),
  });

  for (let index = 0; index < records.length; index += IMPORT_CHUNK) {
    // oxlint-disable-next-line no-await-in-loop -- stage provider pages into one resumable run
    await stageImportRecords(env.DB, viewerId, run.id, records.slice(index, index + IMPORT_CHUNK));
  }

  await transitionImportRun(env.DB, viewerId, run.id, ["staging"], "matching");
  await env.INGESTION_QUEUE.send(
    { type: "process-viewer-import", runId: run.id },
    { contentType: "json" },
  );

  logEvent("trakt_history_staged", { runId: run.id, entries: records.length });

  return run.id;
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
  lastWatchedAt: string | null;
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
    `SELECT title_id AS "titleId", status, rating,
            last_watched_at AS "lastWatchedAt", updated_at AS "updatedAt"
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
        ...(row.lastWatchedAt ? { watchedAt: databaseDate(row.lastWatchedAt).toISOString() } : {}),
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

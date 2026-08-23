import type { ShelfResponse } from "../../src/domain/shelf.ts";
import { isEntryStatus, isKnownTitle } from "../lib/validation.ts";
import { deleteEpisodeEntries } from "../repositories/episode-entries.ts";
import {
  deleteViewingEntry,
  readProfileSummary,
  readViewingEntry,
  saveViewingEntry,
} from "../repositories/profile.ts";
import {
  readLostProperty,
  readShelfGenres,
  readShelfPage,
  type ShelfPageQuery,
} from "../repositories/shelf.ts";

const MAX_THOUGHTS_LENGTH = 2_000;

type ProfileUpdateResult = { ok: true; payload: unknown } | { ok: false; error: string };

export async function getProfile(db: D1Database, viewerId: string) {
  return readProfileSummary(db, viewerId);
}

export async function getViewingEntry(db: D1Database, viewerId: string, titleId: string) {
  if (!isKnownTitle(titleId)) {
    return null;
  }

  return readViewingEntry(db, viewerId, titleId);
}

const LOST_AFTER_DAYS = 180;
const LOST_LIMIT = 8;

export async function getShelf(
  db: D1Database,
  viewerId: string,
  query: ShelfPageQuery,
): Promise<ShelfResponse> {
  const [page, genres, lost] = await Promise.all([
    readShelfPage(db, viewerId, query),
    query.page === 0 ? readShelfGenres(db, viewerId) : Promise.resolve([]),
    query.page === 0
      ? readLostProperty(db, viewerId, LOST_AFTER_DAYS, LOST_LIMIT)
      : Promise.resolve([]),
  ]);

  return {
    items: page.items,
    lost,
    genres,
    matched: page.matched,
    shelved: page.shelved,
    page: query.page,
    pageSize: query.pageSize,
    hasMore: (query.page + 1) * query.pageSize < page.matched,
  };
}

function countOrNull(value: unknown, limit: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= limit ? parsed : null;
}

export async function updateProfile(
  db: D1Database,
  viewerId: string,
  input: Record<string, unknown>,
): Promise<ProfileUpdateResult> {
  if (!isKnownTitle(input.titleId)) {
    return { ok: false, error: "Unknown title" };
  }

  if (!isEntryStatus(input.status)) {
    return { ok: false, error: "Invalid status" };
  }

  const rating = input.rating === null || input.rating === undefined ? null : Number(input.rating);

  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { ok: false, error: "Rating must be between 1 and 5" };
  }

  const thoughts =
    typeof input.thoughts === "string" ? input.thoughts.trim().slice(0, MAX_THOUGHTS_LENGTH) : "";
  const entry = await saveViewingEntry(db, viewerId, {
    titleId: input.titleId,
    status: input.status,
    rating,
    thoughts,
    season: countOrNull(input.season, 100),
    episode: countOrNull(input.episode, 500),
  });

  return { ok: true, payload: { entry } };
}

export async function removeFromProfile(db: D1Database, viewerId: string, titleId: string) {
  if (!isKnownTitle(titleId)) {
    return false;
  }

  await deleteViewingEntry(db, viewerId, titleId);
  await deleteEpisodeEntries(db, viewerId, titleId);

  return true;
}

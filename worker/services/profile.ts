import type { ViewerAccess } from "../../src/domain/access.ts";
import type { ShelfResponse } from "../../src/domain/shelf.ts";
import { isEntryStatus, isKnownTitle, validProviderIds } from "../lib/validation.ts";
import { deleteProfileDataInTransaction } from "../repositories/profile-removal.ts";
import {
  readProfileSummary,
  readProviderPreferences,
  readViewingEntry,
  saveProviderPreferences,
  saveViewingEntry,
} from "../repositories/profile.ts";
import {
  readLostProperty,
  readShelfGenres,
  readShelfPage,
  type ShelfPageQuery,
} from "../repositories/shelf.ts";
import {
  insertManualRemovalEvent,
  insertManualTitleEvents,
} from "../repositories/viewing-events.ts";
import { syncSeriesEntry } from "./seasons.ts";

const MAX_THOUGHTS_LENGTH = 2_000;

type ProfileUpdateResult = { ok: true; payload: unknown } | { ok: false; error: string };

export async function getProfile(db: Database, viewerId: string) {
  return readProfileSummary(db, viewerId);
}

export async function getViewingEntry(db: Database, viewerId: string, titleId: string) {
  if (!isKnownTitle(titleId)) {
    return null;
  }

  return readViewingEntry(db, viewerId, titleId);
}

const LOST_AFTER_DAYS = 180;
const LOST_LIMIT = 8;

export async function getShelf(
  db: Database,
  viewerId: string,
  query: ShelfPageQuery,
  access: ViewerAccess,
): Promise<ShelfResponse> {
  const [page, genres, lost] = await Promise.all([
    readShelfPage(db, viewerId, query, access),
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

export async function updateProfile(
  db: Database,
  viewerId: string,
  input: Record<string, unknown>,
): Promise<ProfileUpdateResult> {
  if (!isKnownTitle(input.titleId)) {
    return { ok: false, error: "Unknown title" };
  }

  if (!isEntryStatus(input.status)) {
    return { ok: false, error: "Invalid status" };
  }

  const titleId = input.titleId;
  const status = input.status;

  const rating = input.rating === null || input.rating === undefined ? null : Number(input.rating);

  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { ok: false, error: "Rating must be between 1 and 5" };
  }

  const thoughts =
    typeof input.thoughts === "string" ? input.thoughts.trim().slice(0, MAX_THOUGHTS_LENGTH) : "";
  let entry = await db.transaction(async (transaction) => {
    await insertManualTitleEvents(transaction, viewerId, {
      titleId,
      status,
      rating,
    });

    return saveViewingEntry(transaction, viewerId, {
      titleId,
      status,
      rating,
      thoughts,
    });
  });

  if (titleId.startsWith("tv:")) {
    await syncSeriesEntry(db, viewerId, titleId);
    entry = await readViewingEntry(db, viewerId, titleId);
  }

  return { ok: true, payload: { entry } };
}

export async function getProviderPreferences(db: Database, viewerId: string) {
  const selectedProviderIds = await readProviderPreferences(db, viewerId);

  return { selectedProviderIds: selectedProviderIds ?? [], isSaved: selectedProviderIds !== null };
}

export async function updateProviderPreferences(
  db: Database,
  viewerId: string,
  input: Record<string, unknown>,
) {
  const selectedProviderIds = validProviderIds(input.selectedProviderIds);

  await saveProviderPreferences(db, viewerId, selectedProviderIds);

  return { selectedProviderIds, isSaved: true };
}

export async function removeFromProfile(db: Database, viewerId: string, titleId: string) {
  if (!isKnownTitle(titleId)) {
    return false;
  }

  await db.transaction(async (transaction) => {
    await insertManualRemovalEvent(transaction, viewerId, titleId);
    await deleteProfileDataInTransaction(transaction, viewerId, titleId);
  });

  return true;
}

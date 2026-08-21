import { isEntryStatus, isKnownTitle, validProviderIds } from "../lib/validation.ts";
import {
  deleteViewingEntry,
  readProfile,
  saveProviderPreferences,
  saveViewingEntry,
} from "../repositories/profile.ts";

const MAX_THOUGHTS_LENGTH = 2_000;

type ProfileUpdateResult = { ok: true; payload: unknown } | { ok: false; error: string };

export async function getProfile(db: D1Database, viewerId: string) {
  return readProfile(db, viewerId);
}

export async function updateProfile(
  db: D1Database,
  viewerId: string,
  input: Record<string, unknown>,
): Promise<ProfileUpdateResult> {
  if (Array.isArray(input.selectedProviderIds)) {
    const selectedProviderIds = validProviderIds(input.selectedProviderIds);

    await saveProviderPreferences(db, viewerId, selectedProviderIds);

    return { ok: true, payload: { preference: { selectedProviderIds } } };
  }

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
  });

  return { ok: true, payload: { entry } };
}

export async function removeFromProfile(db: D1Database, viewerId: string, titleId: string) {
  if (!isKnownTitle(titleId)) {
    return false;
  }

  await deleteViewingEntry(db, viewerId, titleId);

  return true;
}

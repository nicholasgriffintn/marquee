import { accessFor, NO_ACCESS, type ViewerAccess } from "../../../src/domain/access.ts";
import { sessionPrincipal } from "../../auth/session.ts";
import { logError } from "../../lib/logging.ts";
import { readAccessPreferences } from "../../repositories/notebook-preferences.ts";
import type { Bindings } from "../../types.ts";
import type { ViewerState } from "./state.ts";

const resolved = new WeakMap<Request, Promise<ViewerAccess>>();

export async function readViewerAccess(db: Database, viewerId: string | null) {
  if (!viewerId) {
    return NO_ACCESS;
  }

  try {
    return accessFor(true, await readAccessPreferences(db, viewerId));
  } catch (error) {
    logError("viewer_access_read_failed", error, { viewerId });

    return { ...NO_ACCESS, signedIn: true };
  }
}

export function viewerAccess(env: Bindings, request: Request) {
  const cached = resolved.get(request);

  if (cached) {
    return cached;
  }

  const pending = sessionPrincipal(env, request).then((principal) =>
    readViewerAccess(env.DB, principal?.user.id ?? null),
  );

  resolved.set(request, pending);

  return pending;
}

export function accessOf(state: ViewerState) {
  return accessFor(Boolean(state.viewerId), state.preferences);
}

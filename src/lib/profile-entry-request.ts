import type { ViewingEntry } from "../types";
import { requestJson } from "./api.ts";

export function requestProfileEntry(titleId: string, signal?: AbortSignal) {
  return requestJson<{ entry: ViewingEntry | null }>(
    `/api/profile/entry/${encodeURIComponent(titleId)}`,
    { signal },
  );
}

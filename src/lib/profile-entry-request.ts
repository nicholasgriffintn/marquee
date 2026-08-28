import type { ViewingEntry } from "../types";
import { jsonQueryOptions, queryClient } from "./query-client.ts";

export function profileEntryQueryKey(titleId: string) {
  return ["profile-entry", titleId];
}

export function requestProfileEntry(titleId: string) {
  return queryClient.fetchQuery({
    ...jsonQueryOptions<{ entry: ViewingEntry | null }>(
      `/api/profile/entry/${encodeURIComponent(titleId)}`,
    ),
    queryKey: profileEntryQueryKey(titleId),
  });
}

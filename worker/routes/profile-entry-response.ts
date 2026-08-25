import { jsonResponse } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";

export async function profileEntryResponse(readEntry: () => Promise<unknown>) {
  try {
    return jsonResponse({ entry: await readEntry() });
  } catch (error) {
    logError("profile_entry_read_failed", error);

    return jsonResponse({ error: "Shelf entry unavailable" }, 503);
  }
}

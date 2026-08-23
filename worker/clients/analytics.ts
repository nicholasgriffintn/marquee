import { logError } from "../lib/logging.ts";
import type { Bindings } from "../types.ts";

const DATASET = "marquee_events";

export async function queryAnalytics<T>(env: Bindings, sql: string): Promise<T[]> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    return [];
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          "content-type": "text/plain",
        },
        body: sql,
      },
    );

    if (!response.ok) {
      logError("analytics_query_failed", new Error(`analytics ${response.status}`));

      return [];
    }

    const payload = (await response.json()) as { data?: T[] };

    return payload.data ?? [];
  } catch (error) {
    logError("analytics_query_failed", error);

    return [];
  }
}

export function eventsTable() {
  return DATASET;
}

import type { Bindings } from "../types.ts";
import { upstreamFetch } from "./fetch.ts";

const DATASET = "marquee_events";
const TIMEOUT_MS = 15_000;
const REASON_LIMIT = 200;

export async function queryAnalytics<T>(env: Bindings, sql: string): Promise<T[]> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "Analytics is not configured: set both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN",
    );
  }

  const response = await upstreamFetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: "POST",
      timeoutMs: TIMEOUT_MS,
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "content-type": "text/plain",
      },
      body: sql,
    },
  );

  if (!response.ok) {
    const reason = (await response.text()).slice(0, REASON_LIMIT).trim();

    throw new Error(`Analytics query failed: ${response.status} ${reason}`.trim());
  }

  const payload = (await response.json()) as { data?: T[] };

  return payload.data ?? [];
}

export function eventsTable() {
  return DATASET;
}

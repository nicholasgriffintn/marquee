import type { Bindings } from "../types.ts";

export async function scheduleIngestion(env: Bindings) {
  await env.INGESTION_QUEUE.sendBatch([
    { body: { type: "sync-providers" }, contentType: "json" },
    { body: { type: "sync-catalog" }, contentType: "json" },
  ]);
}

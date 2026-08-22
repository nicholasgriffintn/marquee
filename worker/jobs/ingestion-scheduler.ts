import type { Bindings } from "../types.ts";

export async function scheduleIngestion(env: Bindings) {
  await env.CATALOG_SWEEP.create({ params: {} });
}

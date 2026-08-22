import type { Bindings } from "../types.ts";

export async function scheduleIngestion(env: Bindings, cron: string) {
  if (cron === "0 9 * * 1") {
    await env.DIGEST_WORKFLOW.create({ params: {} });

    return;
  }

  await env.CATALOG_SWEEP.create({ params: {} });
}

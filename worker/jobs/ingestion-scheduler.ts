import type { Bindings } from "../types.ts";

const DIGEST_CRON = "0 9 * * 1";
const DEEP_SWEEP_CRON = "41 4 * * *";

export async function scheduleIngestion(env: Bindings, cron: string) {
  if (cron === DIGEST_CRON) {
    await env.DIGEST_WORKFLOW.create({ params: {} });

    return;
  }

  await env.CATALOG_SWEEP.create({ params: { deep: cron === DEEP_SWEEP_CRON } });
}

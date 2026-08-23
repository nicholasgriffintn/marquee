import { computeAngleScores } from "../services/angle-scores.ts";
import { announceArrivals } from "../services/arrivals.ts";
import type { Bindings } from "../types.ts";

const DIGEST_CRON = "0 9 * * 1";
const DEEP_SWEEP_CRON = "41 4 * * *";

export async function scheduleIngestion(env: Bindings, cron: string) {
  if (cron === DIGEST_CRON) {
    await computeAngleScores(env);
    await env.DIGEST_WORKFLOW.create({ params: {} });

    return;
  }

  if (cron === DEEP_SWEEP_CRON) {
    await announceArrivals(env, env.SITE_ORIGIN ?? "https://marquee.pashi.app");
  }

  await env.CATALOG_SWEEP.create({ params: { deep: cron === DEEP_SWEEP_CRON } });
}

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { withDatabase } from "../database/runtime.ts";
import { readViewerEntries } from "../repositories/viewer-context.ts";
import { refreshBeliefs } from "../services/beliefs.ts";
import { buildDigest, viewersWithShelves } from "../services/digest.ts";
import type { WorkerBindings } from "../types.ts";

const RETRIES = { limit: 2, delay: "20 seconds", backoff: "exponential" } as const;

export class DigestWorkflow extends WorkflowEntrypoint<WorkerBindings, unknown> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    const viewerIds = await step.do("find shelves", { retries: RETRIES }, async () =>
      withDatabase(this.env, viewersWithShelves),
    );
    let built = 0;

    for (const viewerId of viewerIds) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await step
        .do(`digest ${viewerId}`, { retries: RETRIES }, () =>
          withDatabase(this.env, async (env) => Boolean(await buildDigest(env, viewerId))),
        )
        .catch(() => false);

      built += result ? 1 : 0;

      // oxlint-disable-next-line no-await-in-loop
      await step
        .do(`beliefs ${viewerId}`, { retries: RETRIES }, () =>
          withDatabase(this.env, async (env) => {
            const entries = await readViewerEntries(env.DB, viewerId);

            return refreshBeliefs(env, viewerId, entries, { includeFacets: true });
          }),
        )
        .catch(() => 0);
    }

    return { built };
  }
}

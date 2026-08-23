import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { readViewerContext } from "../repositories/viewer-context.ts";
import { refreshBeliefs } from "../services/beliefs.ts";
import { buildDigest, viewersWithShelves } from "../services/digest.ts";
import type { Bindings } from "../types.ts";

const RETRIES = { limit: 2, delay: "20 seconds", backoff: "exponential" } as const;

export class DigestWorkflow extends WorkflowEntrypoint<Bindings, unknown> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    const viewerIds = await step.do("find shelves", { retries: RETRIES }, async () =>
      viewersWithShelves(this.env),
    );
    let built = 0;

    for (const viewerId of viewerIds) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await step
        .do(`digest ${viewerId}`, { retries: RETRIES }, async () =>
          Boolean(await buildDigest(this.env, viewerId)),
        )
        .catch(() => false);

      built += result ? 1 : 0;

      // oxlint-disable-next-line no-await-in-loop
      await step
        .do(`beliefs ${viewerId}`, { retries: RETRIES }, async () => {
          const viewer = await readViewerContext(this.env.DB, viewerId);

          return refreshBeliefs(this.env, viewerId, viewer);
        })
        .catch(() => 0);
    }

    return { built };
  }
}

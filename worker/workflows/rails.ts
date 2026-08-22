import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { recordEvent } from "../lib/events.ts";
import {
  buildOneRail,
  dedupeRails,
  getPersonalRails,
  persistRails,
  prepareRails,
  readRailViewer,
  type StoredRail,
} from "../services/ai-rails.ts";
import type { Bindings } from "../types.ts";

const RETRIES = { limit: 2, delay: "10 seconds", backoff: "exponential" } as const;

export type RailsParameters = { viewerId: string };

export class RailsWorkflow extends WorkflowEntrypoint<Bindings, RailsParameters> {
  async run(event: Readonly<WorkflowEvent<RailsParameters>>, step: WorkflowStep) {
    const { viewerId } = event.payload;
    const { viewer, preferences } = await readRailViewer(this.env, viewerId);
    const { signature } = await getPersonalRails(this.env, viewerId);
    const prepared = await step.do("read taste", { retries: RETRIES }, async () =>
      prepareRails(this.env, viewer, viewerId, preferences),
    );
    const built = await Promise.all(
      prepared.angles.map((angle) =>
        step
          .do(`build ${angle.id}`, { retries: RETRIES }, async () => {
            const rail = await buildOneRail(
              this.env,
              viewer,
              angle,
              prepared.exclude,
              viewerId,
              prepared.seeds[angle.id] ?? [],
              prepared.shelf,
              prepared.summary,
            );

            return rail ?? null;
          })
          .catch(() => null),
      ),
    );
    const rails = dedupeRails(built.filter((rail): rail is StoredRail => Boolean(rail)));

    if (rails.length === 0) {
      return { rails: 0 };
    }

    await step.do("persist", { retries: RETRIES }, async () => {
      await persistRails(this.env, viewerId, signature, rails);

      return rails.length;
    });

    recordEvent(this.env, { name: "rails_built", viewerId, value: rails.length });

    return { rails: rails.length };
  }
}

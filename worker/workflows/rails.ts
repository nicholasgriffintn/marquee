import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { recordEvent } from "../lib/events.ts";
import { buildOneRail, dedupeRails, prepareRails, readRailViewer } from "../services/ai-rails.ts";
import { persistRails, readRailRecord } from "../services/rail-generation.ts";
import type { StoredRail } from "../services/rail-identity.ts";
import type { Bindings, RailsParameters } from "../types.ts";

const RETRIES = { limit: 2, delay: "10 seconds", backoff: "exponential" } as const;

export class RailsWorkflow extends WorkflowEntrypoint<Bindings, RailsParameters> {
  async run(event: Readonly<WorkflowEvent<RailsParameters>>, step: WorkflowStep) {
    const { viewerId, revision, generationId } = event.payload;
    const rails = await this.build(viewerId, revision, step);

    await step.do("persist", { retries: RETRIES }, async () => {
      await persistRails(this.env.DB, viewerId, revision, generationId, rails);

      return rails.length;
    });

    recordEvent(this.env, {
      name: "rails_built",
      viewerId,
      value: rails.length,
      detail: generationId,
    });

    return { rails: rails.length };
  }

  private async build(viewerId: string, revision: string, step: WorkflowStep) {
    const { viewer, preferences } = await readRailViewer(this.env, viewerId);
    const record = await readRailRecord(this.env.DB, viewerId, revision);
    const prepared = await step.do("read taste", { retries: RETRIES }, async () =>
      prepareRails(this.env, viewer, viewerId, preferences, record.rails),
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

    return dedupeRails(built.filter((rail): rail is StoredRail => Boolean(rail)));
  }
}

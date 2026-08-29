import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { newDecisionId } from "../ai/run.ts";
import { recordEvent } from "../lib/events.ts";
import {
  buildOneRail,
  dedupeRails,
  getAiRails,
  persistRails,
  prepareRails,
  type StoredRail,
} from "../services/ai-rails.ts";
import { readViewerState } from "../services/viewer/state.ts";
import type { Bindings } from "../types.ts";

const RETRIES = { limit: 2, delay: "10 seconds", backoff: "exponential" } as const;

export type RailsParameters = { viewerId: string };

export class RailsWorkflow extends WorkflowEntrypoint<Bindings, RailsParameters> {
  async run(event: Readonly<WorkflowEvent<RailsParameters>>, step: WorkflowStep) {
    const { viewerId } = event.payload;
    const decisionId = newDecisionId();
    const viewer = await readViewerState(this.env, viewerId);
    const { signature } = await getAiRails(this.env, viewer);
    const prepared = await step.do("read taste", { retries: RETRIES }, async () =>
      prepareRails(this.env, viewer),
    );
    const built = await Promise.all(
      prepared.angles.map((angle) =>
        step
          .do(`build ${angle.id}`, { retries: RETRIES }, async () => {
            const rail = await buildOneRail(
              this.env,
              viewer,
              prepared.eligibility,
              angle,
              decisionId,
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

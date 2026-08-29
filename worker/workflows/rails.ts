import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import type { DecisionDraft } from "../lib/decisions.ts";
import { recordEvent } from "../lib/events.ts";
import {
  buildOneRail,
  dedupeRails,
  getAiRails,
  persistRails,
  prepareRails,
  readRailViewer,
  type BuiltRail,
  type StoredRail,
} from "../services/ai-rails.ts";
import { settleDecision } from "../services/decisions.ts";
import type { Bindings } from "../types.ts";

const RETRIES = { limit: 2, delay: "10 seconds", backoff: "exponential" } as const;

export type RailsParameters = { viewerId: string };

export class RailsWorkflow extends WorkflowEntrypoint<Bindings, RailsParameters> {
  async run(event: Readonly<WorkflowEvent<RailsParameters>>, step: WorkflowStep) {
    const { viewerId } = event.payload;
    const { viewer, preferences } = await readRailViewer(this.env, viewerId);
    const { signature } = await getAiRails(this.env, viewerId);
    const prepared = await step.do("read taste", { retries: RETRIES }, async () =>
      prepareRails(this.env, viewer, viewerId, preferences),
    );
    const built = await Promise.all(
      prepared.angles.map((angle) =>
        step
          .do(`build ${angle.id}`, { retries: RETRIES }, async () =>
            buildOneRail(this.env, viewer, angle, prepared.exclude, {
              viewerId,
              seeds: prepared.seeds[angle.id] ?? [],
              candidates: prepared.candidates[angle.id] ?? [],
              shelf: prepared.shelf,
              summary: prepared.summary,
            }),
          )
          .catch((): BuiltRail | null => null),
      ),
    );
    const rails = dedupeRails(
      built.flatMap((entry): StoredRail[] => (entry?.rail ? [entry.rail] : [])),
    );

    await Promise.all(
      built.flatMap((entry): Promise<void>[] => {
        if (!entry) {
          return [];
        }

        const kept = rails.find((rail) => rail.decisionId === entry.decision.id);
        const draft: DecisionDraft = { ...entry.decision, selected: kept?.titleIds ?? [] };

        return [settleDecision(this.env, draft, kept ? "served" : "empty")];
      }),
    );

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

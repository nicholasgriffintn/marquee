import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { withDatabase } from "../database/runtime.ts";
import type { DecisionDraft } from "../lib/decisions.ts";
import { recordEvent } from "../lib/events.ts";
import { buildOneRail, dedupeRails, prepareRails, type BuiltRail } from "../services/ai-rails.ts";
import { settleDecision } from "../services/decisions.ts";
import { persistRails, readRailRecord } from "../services/rail-generation.ts";
import type { StoredRail } from "../services/rail-identity.ts";
import { readViewerState } from "../services/viewer/state.ts";
import type { RailsParameters, WorkerBindings } from "../types.ts";

const RETRIES = { limit: 2, delay: "10 seconds", backoff: "exponential" } as const;

export class RailsWorkflow extends WorkflowEntrypoint<WorkerBindings, RailsParameters> {
  async run(event: Readonly<WorkflowEvent<RailsParameters>>, step: WorkflowStep) {
    const { viewerId, revision, generationId } = event.payload;
    const { rails, built } = await this.build(viewerId, revision, step);

    const persisted = await step.do("persist", { retries: RETRIES }, () =>
      withDatabase(this.env, (env) =>
        persistRails(env.DB, viewerId, revision, generationId, rails),
      ),
    );
    const delivered = persisted ? rails : [];

    await step.do("record decisions", { retries: RETRIES }, () =>
      withDatabase(this.env, async (env) => {
        await Promise.all(
          built.flatMap((entry): Promise<void>[] => {
            if (!entry) {
              return [];
            }

            const kept = delivered.find((rail) => rail.decisionId === entry.decision.id);
            const draft: DecisionDraft = { ...entry.decision, selected: kept?.titleIds ?? [] };

            return [settleDecision(env, draft, kept ? "served" : "empty")];
          }),
        );

        return built.length;
      }),
    );

    recordEvent(this.env, {
      name: "rails_built",
      viewerId,
      value: delivered.length,
      detail: generationId,
    });

    return { rails: delivered.length, superseded: !persisted };
  }

  private async build(viewerId: string, revision: string, step: WorkflowStep) {
    const { viewer, record } = await withDatabase(this.env, async (env) => ({
      viewer: await readViewerState(env, viewerId),
      record: await readRailRecord(env.DB, viewerId, revision),
    }));
    const prepared = await step.do("read taste", { retries: RETRIES }, () =>
      withDatabase(this.env, (env) => prepareRails(env, viewer, record.rails)),
    );
    const built = await Promise.all(
      prepared.angles.map((angle) =>
        step
          .do(`build ${angle.id}`, { retries: RETRIES }, () =>
            withDatabase(this.env, (env) =>
              buildOneRail(env, viewer, prepared.eligibility, angle, {
                viewerId,
                seeds: prepared.seeds[angle.id] ?? [],
                candidates: prepared.candidates[angle.id] ?? [],
                shelf: prepared.shelf,
                summary: prepared.summary,
              }),
            ),
          )
          .catch((): BuiltRail | null => null),
      ),
    );
    const rails = dedupeRails(
      built.flatMap((entry): StoredRail[] => (entry?.rail ? [entry.rail] : [])),
    );

    return { rails, built };
  }
}

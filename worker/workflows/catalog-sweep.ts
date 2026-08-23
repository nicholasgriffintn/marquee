import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { pruneIngestionRuns } from "../jobs/ingestion-runs.ts";
import {
  queueAvailability,
  queueEmbeddings,
  queueEnrichment,
  queueStaleAvailability,
  syncCatalogHead,
} from "../jobs/ingestion.ts";
import { getProviderLedger } from "../jobs/provider-ledger.ts";
import { pruneScreenings } from "../repositories/cinemas.ts";
import { storeProviders } from "../repositories/providers.ts";
import { rebuildPeopleIndex } from "../repositories/usher.ts";
import { rebuildWorkingSet } from "../repositories/working-set.ts";
import { syncBuzz } from "../services/buzz.ts";
import { queueCinemaDirectories, queueCinemaScreenings } from "../services/cinema-sync.ts";
import { advanceDiscoverFrontier } from "../services/discover.ts";
import { syncSchedule } from "../services/schedule.ts";
import { buildSections } from "../services/sections.ts";
import type { Bindings, CatalogSweepParameters } from "../types.ts";

const RETRIES = { limit: 4, delay: "30 seconds", backoff: "exponential" } as const;

export class CatalogSweep extends WorkflowEntrypoint<Bindings, CatalogSweepParameters> {
  async run(event: Readonly<WorkflowEvent<CatalogSweepParameters>>, step: WorkflowStep) {
    const deep = event.payload?.deep === true;

    if (deep) {
      await step.do("sync providers", { retries: RETRIES }, async () => {
        const providers = await getProviderLedger(this.env);

        await storeProviders(this.env.DB, providers);

        return providers.providers.length;
      });
    }

    const titleIds = await step.do("sync catalogue head", { retries: RETRIES }, async () =>
      syncCatalogHead(this.env),
    );

    await step.do("advance discover frontier", { retries: RETRIES }, async () =>
      advanceDiscoverFrontier(this.env),
    );

    await step.do("queue availability", { retries: RETRIES }, async () => {
      await queueAvailability(this.env, titleIds);

      return titleIds.length;
    });

    await step.do("queue enrichment", { retries: RETRIES }, async () => {
      await queueEnrichment(this.env);

      return true;
    });

    if (deep) {
      await step.do("sync cinema directories", { retries: RETRIES }, async () =>
        queueCinemaDirectories(this.env),
      );
    }

    await step.do("queue cinema screenings", { retries: RETRIES }, async () =>
      queueCinemaScreenings(this.env),
    );

    await step.do("prune past screenings", { retries: RETRIES }, async () =>
      pruneScreenings(this.env.DB),
    );

    await step.do("sync schedule", { retries: RETRIES }, async () => syncSchedule(this.env));

    await step.do("sync buzz", { retries: RETRIES }, async () => syncBuzz(this.env));

    await step.do("queue embeddings", { retries: RETRIES }, async () => {
      await queueEmbeddings(this.env);

      return true;
    });

    await step.do("build sections", { retries: RETRIES }, async () => buildSections(this.env));

    await step.do("rebuild working set", { retries: RETRIES }, async () =>
      rebuildWorkingSet(this.env.DB),
    );

    await step.do("queue stale availability", { retries: RETRIES }, async () =>
      queueStaleAvailability(this.env),
    );

    await step.do("index people", { retries: RETRIES }, async () =>
      rebuildPeopleIndex(this.env.DB),
    );

    await step.do("prune run log", { retries: RETRIES }, async () => pruneIngestionRuns(this.env));

    return { titles: titleIds.length, deep };
  }
}

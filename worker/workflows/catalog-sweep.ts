import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import {
  queueAvailability,
  queueDiscoverPages,
  queueEmbeddings,
  queueEnrichment,
  syncCatalogHead,
} from "../jobs/ingestion.ts";
import { getProviderLedger } from "../jobs/provider-ledger.ts";
import { storeProviders } from "../repositories/providers.ts";
import { syncBuzz } from "../services/buzz.ts";
import { syncSchedule } from "../services/schedule.ts";
import { buildSections } from "../services/sections.ts";
import type { Bindings } from "../types.ts";

const RETRIES = { limit: 4, delay: "30 seconds", backoff: "exponential" } as const;

export class CatalogSweep extends WorkflowEntrypoint<Bindings, unknown> {
  async run(_event: Readonly<WorkflowEvent<unknown>>, step: WorkflowStep) {
    await step.do("sync providers", { retries: RETRIES }, async () => {
      const providers = await getProviderLedger(this.env);

      await storeProviders(this.env.DB, providers);

      return providers.providers.length;
    });

    const titleIds = await step.do("sync catalogue head", { retries: RETRIES }, async () =>
      syncCatalogHead(this.env),
    );

    await step.do("queue discover pages", { retries: RETRIES }, async () =>
      queueDiscoverPages(this.env),
    );

    await step.do("queue availability", { retries: RETRIES }, async () => {
      await queueAvailability(this.env, titleIds);

      return titleIds.length;
    });

    await step.do("queue enrichment", { retries: RETRIES }, async () => {
      await queueEnrichment(this.env);

      return true;
    });

    await step.do("build sections", { retries: RETRIES }, async () => buildSections(this.env));

    await step.do("sync schedule", { retries: RETRIES }, async () => syncSchedule(this.env));

    await step.do("sync buzz", { retries: RETRIES }, async () => syncBuzz(this.env));

    await step.sleep("let discover pages land", "10 minutes");

    await step.do("queue embeddings", { retries: RETRIES }, async () => {
      await queueEmbeddings(this.env);

      return true;
    });

    await step.do("rebuild sections", { retries: RETRIES }, async () => buildSections(this.env));

    return { titles: titleIds.length };
  }
}

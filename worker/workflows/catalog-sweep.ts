import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { withDatabase } from "../database/runtime.ts";
import { pruneIngestionRuns } from "../jobs/ingestion-runs.ts";
import { queueEmbeddings, queueStaleAvailability } from "../jobs/ingestion.ts";
import { getProviderLedger } from "../jobs/provider-ledger.ts";
import { GAP_DISCOVERY } from "../lib/catalogue-gaps.ts";
import { ensureBudgets } from "../repositories/budgets.ts";
import { pruneCatalogueGaps } from "../repositories/catalogue-gaps.ts";
import { pruneScreenings } from "../repositories/cinemas.ts";
import { storeProviders } from "../repositories/providers.ts";
import { rebuildPeopleIndex } from "../repositories/usher.ts";
import { rebuildWorkingSet } from "../repositories/working-set.ts";
import { syncAdaptations } from "../services/adaptations.ts";
import { syncAwards } from "../services/awards.ts";
import { queueCinemaDirectories, queueCinemaScreenings } from "../services/cinema-sync.ts";
import {
  DEEP_RECONCILE_LIMIT,
  RECONCILE_LIMIT,
  reconcileSearchIndex,
} from "../services/index-readiness.ts";
import { queueRevivalMirrors } from "../services/revival-mirror.ts";
import { checkRevivalRights } from "../services/revival-rights.ts";
import { queueRevivalSources } from "../services/revival.ts";
import { syncTitlePlaces } from "../services/title-places.ts";
import { syncVisualFormat } from "../services/visual-format.ts";
import type { CatalogSweepParameters, WorkerBindings } from "../types.ts";

const RETRIES = {
  limit: 4,
  delay: "30 seconds",
  backoff: "exponential",
} as const;

export class CatalogSweep extends WorkflowEntrypoint<WorkerBindings, CatalogSweepParameters> {
  async run(event: Readonly<WorkflowEvent<CatalogSweepParameters>>, step: WorkflowStep) {
    const deep = event.payload?.deep === true;

    if (deep) {
      await step.do("import anime ids", { retries: RETRIES }, async () => {
        await this.env.ANIME_QUEUE.send({
          type: "import-anime-ids",
          offset: 0,
        });

        return true;
      });

      await step.do("sync providers", { retries: RETRIES }, async () => {
        const providers = await withDatabase(this.env, async (env) => {
          const ledger = await getProviderLedger(env);

          await storeProviders(env.DB, ledger);

          return ledger;
        });

        return providers.providers.length;
      });
    }

    await step.do("reconcile budgets", { retries: RETRIES }, () =>
      withDatabase(this.env, ensureBudgets),
    );

    await step.do("sync catalogue head", { retries: RETRIES }, async () => {
      await this.env.INGESTION_QUEUE.send({ type: "sync-catalog" });

      return true;
    });

    if (deep) {
      await step.do("sync cinema directories", { retries: RETRIES }, async () =>
        withDatabase(this.env, queueCinemaDirectories),
      );
    }

    await step.do("queue cinema screenings", { retries: RETRIES }, async () =>
      withDatabase(this.env, queueCinemaScreenings),
    );

    await step.do("prune past screenings", { retries: RETRIES }, async () =>
      withDatabase(this.env, (env) => pruneScreenings(env.DB)),
    );

    await step.do("sync schedule", { retries: RETRIES }, async () => {
      await this.env.INGESTION_QUEUE.send({ type: "sync-schedule" });

      return true;
    });

    await step.do("sync buzz", { retries: RETRIES }, async () => {
      await this.env.INGESTION_QUEUE.send({ type: "sync-buzz" });

      return true;
    });

    await step.do("sync awards", { retries: RETRIES }, () => withDatabase(this.env, syncAwards));

    await step.do("sync visual format", { retries: RETRIES }, async () =>
      withDatabase(this.env, syncVisualFormat),
    );

    await step.do("sync adaptations", { retries: RETRIES }, () =>
      withDatabase(this.env, syncAdaptations),
    );

    await step.do("sync title identifiers", { retries: RETRIES }, async () => {
      await this.env.INGESTION_QUEUE.send({ type: "sync-title-identifiers" });

      return true;
    });

    await step.do("sync filming locations", { retries: RETRIES }, async () =>
      withDatabase(this.env, syncTitlePlaces),
    );

    await step.do("reconcile search index", { retries: RETRIES }, async () =>
      withDatabase(this.env, (env) =>
        reconcileSearchIndex(env, deep ? DEEP_RECONCILE_LIMIT : RECONCILE_LIMIT),
      ),
    );

    await step.do("queue embeddings", { retries: RETRIES }, async () => {
      await withDatabase(this.env, queueEmbeddings);

      return true;
    });

    await step.do("build sections", { retries: RETRIES }, async () => {
      await this.env.INGESTION_QUEUE.send({ type: "build-sections" });

      return true;
    });

    await step.do("rebuild working set", { retries: RETRIES }, async () =>
      withDatabase(this.env, (env) => rebuildWorkingSet(env.DB)),
    );

    await step.do("queue stale availability", { retries: RETRIES }, async () =>
      withDatabase(this.env, (env) => queueStaleAvailability(env)),
    );

    await step.do("refresh people", { retries: RETRIES }, async () => {
      await this.env.INGESTION_QUEUE.send({ type: "refresh-people" });
    });

    await step.do("index people", { retries: RETRIES }, async () =>
      withDatabase(this.env, (env) => rebuildPeopleIndex(env.DB)),
    );

    if (deep) {
      await step.do("sweep public domain sources", { retries: RETRIES }, async () =>
        withDatabase(this.env, queueRevivalSources),
      );
    }

    await step.do("match public domain works", { retries: RETRIES }, async () => {
      await this.env.REVIVAL_QUEUE.send({
        type: "match-revival-works",
        chain: true,
      });

      return true;
    });

    await step.do("describe public domain works", { retries: RETRIES }, async () => {
      await this.env.REVIVAL_QUEUE.send({
        type: "describe-revival-works",
        chain: true,
      });

      return true;
    });

    await step.do("group public domain prints", { retries: RETRIES }, async () => {
      await this.env.REVIVAL_QUEUE.send({ type: "group-revival-prints" });

      return true;
    });

    await step.do("check public domain rights", { retries: RETRIES }, async () =>
      withDatabase(this.env, checkRevivalRights),
    );

    await step.do("recheck print suitability", { retries: RETRIES }, async () => {
      await this.env.REVIVAL_QUEUE.send({
        type: "recheck-revival-works",
        chain: true,
      });

      return true;
    });

    await step.do("queue reel mirrors", { retries: RETRIES }, async () =>
      withDatabase(this.env, queueRevivalMirrors),
    );

    await step.do("prune run log", { retries: RETRIES }, () =>
      withDatabase(this.env, pruneIngestionRuns),
    );

    await step.do("prune catalogue gaps", { retries: RETRIES }, async () =>
      withDatabase(this.env, (env) => pruneCatalogueGaps(env.DB, GAP_DISCOVERY.retentionDays)),
    );

    return { deep };
  }
}

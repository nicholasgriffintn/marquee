import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import type { DeliveredRail, RailsDelivery, RailStatus } from "../../src/domain/rails.ts";
import { logError } from "../lib/logging.ts";
import { readNotebookPreferences } from "../repositories/notebook-preferences.ts";
import { readProviderPreferences } from "../repositories/profile.ts";
import type { Bindings } from "../types.ts";
import { hydrateRails } from "./ai-rails.ts";
import { getPersonalRails } from "./personal-rails.ts";
import { readRailRecord } from "./rail-generation.ts";
import { ensureRailRefreshScheduled } from "./rail-refresh.ts";
import { readCachedRailRevision } from "./rail-revision.ts";

export type DeliveryRequest = {
  viewerId: string | null;
  origin: ViewerOrigin | null;
  generate: boolean;
};

type CuratedDelivery = {
  status: RailStatus;
  revision: string;
  generationId: string;
  rails: DeliveredRail[];
};

const NO_CURATED: CuratedDelivery = {
  status: "ready",
  revision: "",
  generationId: "",
  rails: [],
};

async function curatedDelivery(
  env: Bindings,
  viewerId: string,
  generate: boolean,
): Promise<CuratedDelivery> {
  try {
    const [revision, preferences, providerIds] = await Promise.all([
      readCachedRailRevision(env, viewerId),
      readNotebookPreferences(env.DB, viewerId),
      readProviderPreferences(env.DB, viewerId),
    ]);
    const record = await readRailRecord(env.DB, viewerId, revision);
    const rails = record.rails.length
      ? await hydrateRails(
          env,
          record.rails,
          record.generationId,
          preferences.preferredLanguage,
          providerIds ?? [],
        )
      : [];

    if (record.isSettled || !revision) {
      return { status: "ready", revision, generationId: record.generationId, rails };
    }

    if (generate) {
      await ensureRailRefreshScheduled(env, viewerId, revision);
    }

    return {
      status: record.rails.length ? "ready" : "generating",
      revision,
      generationId: record.generationId,
      rails,
    };
  } catch (error) {
    logError("ai_rails_failed", error);

    return { ...NO_CURATED, status: "error" };
  }
}

export async function deliverRails(
  env: Bindings,
  request: DeliveryRequest,
): Promise<RailsDelivery> {
  const { viewerId, origin, generate } = request;
  const [curated, personal] = await Promise.all([
    viewerId ? curatedDelivery(env, viewerId, generate) : NO_CURATED,
    getPersonalRails(env, viewerId, origin),
  ]);

  return {
    status: curated.status,
    revision: curated.revision,
    generationId: curated.generationId,
    rails: [...curated.rails, ...personal],
  };
}

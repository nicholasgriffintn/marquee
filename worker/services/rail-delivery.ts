import type { ViewerAccess } from "../../src/domain/access.ts";
import type { ViewerOrigin } from "../../src/domain/cinema.ts";
import type { DeliveredRail, RailsDelivery, RailStatus } from "../../src/domain/rails.ts";
import { logError } from "../lib/logging.ts";
import { readNotebookPreferences } from "../repositories/notebook-preferences.ts";
import { readProviderPreferences } from "../repositories/profile.ts";
import { readShelfStatuses } from "../repositories/viewer-context.ts";
import type { Bindings } from "../types.ts";
import { hydrateRails } from "./ai-rails.ts";
import { getPersonalRails } from "./personal-rails.ts";
import { readRailRecord } from "./rail-generation.ts";
import type { StoredRail } from "./rail-identity.ts";
import { ensureRailRefreshScheduled } from "./rail-refresh.ts";
import { readCachedRailRevision } from "./rail-revision.ts";
import { finishedTitleIds } from "./viewer/state.ts";

export type DeliveryRequest = {
  viewerId: string | null;
  origin: ViewerOrigin | null;
  generate: boolean;
  access: ViewerAccess;
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

function withoutFinished(rails: StoredRail[], finished: Set<string>) {
  return rails.map((rail) => ({
    ...rail,
    titleIds: rail.titleIds.filter((titleId) => !finished.has(titleId)),
  }));
}

async function curatedDelivery(
  env: Bindings,
  viewerId: string,
  generate: boolean,
  access: ViewerAccess,
): Promise<CuratedDelivery> {
  try {
    const [revision, preferences, providerIds, shelf] = await Promise.all([
      readCachedRailRevision(env, viewerId),
      readNotebookPreferences(env.DB, viewerId),
      readProviderPreferences(env.DB, viewerId),
      readShelfStatuses(env.DB, viewerId),
    ]);
    const record = await readRailRecord(env.DB, viewerId, revision);
    const rails = record.rails.length
      ? await hydrateRails(
          env,
          withoutFinished(record.rails, new Set(finishedTitleIds(shelf))),
          record.generationId,
          preferences.preferredLanguage,
          providerIds ?? [],
          access,
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
  const { viewerId, origin, generate, access } = request;
  const [curated, personal] = await Promise.all([
    viewerId ? curatedDelivery(env, viewerId, generate, access) : NO_CURATED,
    getPersonalRails(env, viewerId, origin, access),
  ]);

  return {
    status: curated.status,
    revision: curated.revision,
    generationId: curated.generationId,
    rails: [...curated.rails, ...personal],
  };
}

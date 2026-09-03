import type { ViewerAccess } from "../../src/domain/access.ts";
import type { MediaTitle, SourceWork } from "../../src/domain/catalog.ts";
import {
  fetchSourceLinks,
  fetchSourceWorks,
  type SourceWorkRecord,
} from "../clients/wikidata-adaptations.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { isKnownTitle } from "../lib/validation.ts";
import {
  readAdaptationTitleIds,
  readTitleSourceWorks,
  selectAdaptationCandidates,
  storeAdaptations,
  type ScannedTitle,
  type StoredSourceWork,
} from "../repositories/adaptations.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 240;
const REFRESH_DAYS = 60;
const RETRY_DAYS = 180;
const STRIP_LIMIT = 24;

type TitleAdaptations = { source: SourceWork | null; items: MediaTitle[] };

const SOURCE = "wikidata";

const NOTHING: TitleAdaptations = { source: null, items: [] };

function toSourceWork(work: StoredSourceWork): SourceWork {
  return {
    workId: work.workId,
    label: work.label,
    workType: work.workType,
    publishedYear: work.publishedYear,
    authors: work.authors,
  };
}

export async function syncAdaptations(env: Bindings) {
  const candidates = await selectAdaptationCandidates(
    env.DB,
    SAMPLE_SIZE,
    REFRESH_DAYS,
    RETRY_DAYS,
  );

  if (candidates.length === 0) {
    return 0;
  }

  const links = await fetchSourceLinks(candidates).catch(
    (error: unknown): Map<string, string[]> => {
      logError("adaptation_links_failed", error);

      return new Map();
    },
  );

  if (links.size === 0) {
    logEvent("adaptations_synced", {
      candidates: candidates.length,
      linked: 0,
      works: 0,
    });

    return 0;
  }

  const works = await fetchSourceWorks([...links.values()].flat()).catch(
    (error: unknown): Map<string, SourceWorkRecord> => {
      logError("adaptation_works_failed", error);

      return new Map();
    },
  );

  if (works.size === 0) {
    return 0;
  }

  const scanned = candidates.map((candidate): ScannedTitle => ({
    titleId: candidate.titleId,
    works: (links.get(candidate.titleId) ?? []).flatMap((entityId) => {
      const work = works.get(entityId);

      return work ? [work] : [];
    }),
  }));
  const linked = scanned.filter((entry) => entry.works.length > 0);

  await storeAdaptations(env.DB, SOURCE, scanned);

  logEvent("adaptations_synced", {
    candidates: candidates.length,
    linked: linked.length,
    works: works.size,
  });

  return linked.length;
}

export async function getTitleAdaptations(
  db: Database,
  titleId: string,
  access: ViewerAccess,
): Promise<TitleAdaptations> {
  if (!isKnownTitle(titleId)) {
    return NOTHING;
  }

  const [work] = await readTitleSourceWorks(db, titleId);

  if (!work) {
    return NOTHING;
  }

  if (work.adaptations < 2) {
    return { source: toSourceWork(work), items: [] };
  }

  const titleIds = await readAdaptationTitleIds(db, work.workId, STRIP_LIMIT);

  return {
    source: toSourceWork(work),
    items: await readItems(db, titleIds, access, STRIP_LIMIT),
  };
}

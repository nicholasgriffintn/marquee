import { fetchTitleForms, type FormLabels } from "../clients/wikidata-form.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { normaliseAspectRatios, normaliseColours } from "../lib/visual-format.ts";
import { selectFormatCandidates, writeVisualFormats } from "../repositories/title-visual-format.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 750;
const RETRY_DAYS = 90;
const SOURCE = "wikidata";

export async function syncVisualFormat(env: Bindings) {
  const candidates = await selectFormatCandidates(env.DB, SAMPLE_SIZE, RETRY_DAYS);

  if (candidates.length === 0) {
    return 0;
  }

  const labels = await fetchTitleForms(candidates).catch((error: unknown) => {
    logError("visual_format_lookup_failed", error);

    return null;
  });

  if (labels === null) {
    return 0;
  }

  const writes = candidates.map((candidate) => {
    const found: FormLabels = labels.get(candidate.titleId) ?? { colours: [], ratios: [] };

    return {
      titleId: candidate.titleId,
      colours: normaliseColours(found.colours),
      aspectRatios: normaliseAspectRatios(found.ratios),
    };
  });

  await writeVisualFormats(env.DB, SOURCE, writes);

  const described = writes.filter(
    (write) => write.colours.length > 0 || write.aspectRatios.length > 0,
  ).length;

  logEvent("visual_format_synced", {
    candidates: candidates.length,
    matched: labels.size,
    described,
    blank: writes.length - described,
  });

  return described;
}

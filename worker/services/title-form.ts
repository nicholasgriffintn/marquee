import { fetchTitleForms, type FormLabels } from "../clients/wikidata-form.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { normaliseAspectRatio, normaliseColour } from "../lib/title-form.ts";
import { selectFormCandidates, writeTitleForms } from "../repositories/title-form.ts";
import type { Bindings } from "../types.ts";

const SAMPLE_SIZE = 750;
const RETRY_DAYS = 90;

export async function syncTitleForm(env: Bindings) {
  const candidates = await selectFormCandidates(env.DB, SAMPLE_SIZE, RETRY_DAYS);

  if (candidates.length === 0) {
    return 0;
  }

  const labels = await fetchTitleForms(candidates).catch((error: unknown) => {
    logError("title_form_lookup_failed", error);

    return null;
  });

  if (labels === null) {
    return 0;
  }

  const forms = candidates.map((candidate) => {
    const found: FormLabels = labels.get(candidate.titleId) ?? { colours: [], ratios: [] };

    return {
      titleId: candidate.titleId,
      colour: normaliseColour(found.colours),
      aspectRatio: normaliseAspectRatio(found.ratios),
    };
  });

  await writeTitleForms(env.DB, forms);

  const described = forms.filter((form) => Boolean(form.colour ?? form.aspectRatio)).length;

  logEvent("title_form_synced", {
    candidates: candidates.length,
    matched: labels.size,
    described,
    blank: forms.length - described,
  });

  return described;
}

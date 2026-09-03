import type { ContentGate } from "../../src/domain/access.ts";
import { isAdultsOnly } from "../../src/domain/certification.ts";

const RACIST_CONTENT =
  "Contains racist propaganda and depictions. Presented for historical study, not endorsement.";

const COLONIAL_CONTENT =
  "Contains colonial-era attitudes and depictions that are racist by any reading. Presented for historical study, not endorsement.";

const ATROCITY_CONTENT =
  "Contains graphic footage of atrocities and human suffering. Filmed as evidence and presented for historical study.";

const DISTRESSING_CONTENT =
  "The archive holding this print warns that it contains distressing scenes. Presented for historical study.";

const NAZI_CONTENT =
  "State propaganda produced under a fascist government. Presented for historical study, not endorsement.";

const NAMED: { pattern: RegExp; notice: string }[] = [
  { pattern: /\bbirth of a nation\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bcoal black and de sebben dwarfs\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bjungle jitters\b/iu, notice: RACIST_CONTENT },
  { pattern: /\ball this and rabbit stew\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bangel puss\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bgoldilocks and the jivin.? bears\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bhallelujah land\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bclean pastures\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bsunday go to meetin.? time\b/iu, notice: RACIST_CONTENT },
  { pattern: /\btin pan alley cats\b/iu, notice: RACIST_CONTENT },
  { pattern: /\buncle tom\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bwhich is witch\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bblackface\b|\bminstrel/iu, notice: RACIST_CONTENT },
  { pattern: /\bpickaninn|\bdarktown\b|\bcoontown\b/iu, notice: RACIST_CONTENT },
  { pattern: /\bbirth of a race\b/iu, notice: RACIST_CONTENT },
  { pattern: /\btriumph des willens\b|\btriumph of the will\b/iu, notice: NAZI_CONTENT },
  { pattern: /\bder ewige jude\b|\beternal jew\b/iu, notice: NAZI_CONTENT },
  { pattern: /\bjud s(ü|u)(ss|ß)\b/iu, notice: NAZI_CONTENT },
  {
    pattern: /\bsavage\b.*\btribe|\bdarkest africa\b|\bnative races\b/iu,
    notice: COLONIAL_CONTENT,
  },
  {
    pattern:
      /\bconcentration camps?\b|\bdeath camps?\b|\bholocaust\b|\batrocit(y|ies)\b|\bmass graves?\b|\blynching\b|\bwar crimes?\b/iu,
    notice: ATROCITY_CONTENT,
  },
];

const SOURCE_WARNING =
  /\bextremely graphic\b|\bgraphic (scenes|footage|images|content)\b|\bviewer discretion\b|\bexercise caution\b|\bdisturbing (scenes|footage|images)\b/iu;

export function contentNoticeFor(title: string, synopsis = "") {
  const haystack = `${title} ${synopsis}`;

  for (const entry of NAMED) {
    if (entry.pattern.test(haystack)) {
      return entry.notice;
    }
  }

  return SOURCE_WARNING.test(haystack) ? DISTRESSING_CONTENT : null;
}

export function revivalGateFor(work: {
  contentNotice: string | null;
  certification: string | null;
}): ContentGate | null {
  if (work.contentNotice) {
    return "offensive";
  }

  return isAdultsOnly(work.certification) ? "adult" : null;
}

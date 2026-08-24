import type { RevivalBillSlot, RevivalWork } from "../../src/domain/revival.ts";

const LATE_NIGHT = /horror|crime|noir|thriller|mystery|ghost|monster|murder/iu;

const UNSCORED_STANDING = 550;
const STANDING_BIAS = 3;

function seedFrom(day: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < day.length; index += 1) {
    hash ^= day.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function shuffler(seed: number) {
  let state = seed || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 4_294_967_296;
  };
}

function weightFor(work: RevivalWork) {
  const standing = (work.popularity ?? UNSCORED_STANDING) / 100;

  return Math.max(0.01, standing ** STANDING_BIAS);
}

function drawn(items: RevivalWork[], next: () => number) {
  return items
    .map((work) => ({ work, key: next() ** (1 / weightFor(work)) }))
    .sort((left, right) => right.key - left.key)
    .map((entry) => entry.work);
}

function lateNight(work: RevivalWork) {
  return work.tags.some((tag) => LATE_NIGHT.test(tag.label));
}

export function billDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function buildBill(works: RevivalWork[], day: string): RevivalBillSlot[] {
  const next = shuffler(seedFrom(day));
  const taken = new Set<string>();
  const bill: RevivalBillSlot[] = [];
  const pool = drawn(
    works.filter((work) => !work.contentNotice),
    next,
  );
  const take = (slot: string, note: string, matches: (work: RevivalWork) => boolean) => {
    const work = pool.find((entry) => !taken.has(entry.id) && matches(entry));

    if (!work) {
      return;
    }

    taken.add(work.id);

    bill.push({ slot, note, work });
  };

  const isFeature = (work: RevivalWork) => work.kind === "feature";
  const isShort = (work: RevivalWork) => work.kind === "short";

  take("Feature presentation", "Tonight's main attraction.", isFeature);
  take("Supporting feature", "The second half of the double bill.", isFeature);
  take("Short before the feature", "Something to settle into your seat with.", isShort);
  take(
    "Late-night picture",
    "For after the lights have gone down twice.",
    (work) => isFeature(work) && lateNight(work),
  );

  if (!bill.some((entry) => entry.slot === "Late-night picture")) {
    take("Late-night picture", "For after the lights have gone down twice.", isFeature);
  }

  for (let index = 0; index < 3; index += 1) {
    take(
      "Curiosity",
      "Odds and ends from the vault.",
      (work) => work.kind === "ephemeral" || isShort(work),
    );
  }

  return bill;
}

import type { RevivalWork } from "../../src/domain/revival.ts";

export const LATE_NIGHT = /horror|crime|noir|thriller|mystery|ghost|monster|murder/iu;

export const STANDING_BIAS = 3;

export function seedFrom(day: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < day.length; index += 1) {
    hash ^= day.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function shuffler(seed: number) {
  let state = seed || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 4_294_967_296;
  };
}

export function lateNight(work: RevivalWork) {
  return work.tags.some((tag) => LATE_NIGHT.test(tag.label));
}

export function billDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function standingOffset(total: number, roll: number) {
  return Math.min(Math.max(0, total - 1), Math.floor(total * roll ** STANDING_BIAS));
}

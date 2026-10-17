import { TICK_RATE } from '../core/constants';
import type { Status } from '../core/state';

export function statusTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

/**
 * Adds a status unless one with the same key is at least as strong and lasts
 * at least as long. Same-key statuses it outclasses on both counts are dropped,
 * reusing the first one's slot, so refreshing an aura every tick allocates nothing.
 */
export function applyStatus(list: Status[], kind: string, key: string, value: number, ticks: number, src: number): void {
  for (const s of list) if (s.key === key && s.value >= value && s.ticks >= ticks) return;
  let reused = false;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    if (s.key === key && value >= s.value && ticks >= s.ticks) {
      if (reused) continue;
      s.kind = kind;
      s.value = value;
      s.ticks = ticks;
      s.src = src;
      reused = true;
    }
    list[w++] = s;
  }
  list.length = w;
  if (!reused) list.push({ kind, key, value, ticks, src });
}

/** Whether list[i] is the one that counts for its key: the highest value, the earliest on a tie. */
export function isStrongest(list: readonly Status[], i: number): boolean {
  const s = list[i]!;
  for (let j = 0; j < list.length; j++) {
    if (j === i) continue;
    const o = list[j]!;
    if (o.key === s.key && (o.value > s.value || (o.value === s.value && j < i))) return false;
  }
  return true;
}

/** One tick passes: count every status down and drop the expired ones, keeping order. */
export function tickDown(list: Status[]): void {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    s.ticks -= 1;
    if (s.ticks > 0) list[w++] = s;
  }
  list.length = w;
}

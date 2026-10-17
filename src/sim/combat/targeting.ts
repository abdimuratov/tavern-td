import type { TargetLayer } from '../core/specs';
import type { Creep, GameState, Tower } from '../core/state';

export function canHit(targets: TargetLayer, creep: Creep): boolean {
  return targets === 'both' || (targets === 'air') === creep.air;
}

/** Ids only grow and lists are only appended to or filtered, so they stay sorted and binary search works. */
function byId<T extends { id: number }>(list: readonly T[], id: number): T | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = list[mid]!;
    if (item.id === id) return item;
    if (item.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

export function findCreep(state: GameState, id: number): Creep | undefined {
  return byId(state.creeps, id);
}

export function findTower(state: GameState, id: number): Tower | undefined {
  return byId(state.towers, id);
}

/** The closest live creep the layer allows within range (squared), lower id on a tie. */
export function closestCreep(creeps: readonly Creep[], x: number, y: number, range2: number, targets: TargetLayer): Creep | null {
  let best: Creep | null = null;
  let bestD2 = range2;
  for (let i = 0; i < creeps.length; i++) {
    const c = creeps[i]!;
    if (c.hp <= 0 || !canHit(targets, c)) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && best === null)) {
      best = c;
      bestD2 = d2;
    }
  }
  return best;
}

/** Up to `count` closest live creeps within range (squared), skipping `exclude`; closest first, lower id on a tie. */
export function nearestCreeps(
  creeps: readonly Creep[], x: number, y: number, range2: number, targets: TargetLayer,
  count: number, exclude: readonly Creep[],
): Creep[] {
  const found: Creep[] = [];
  const dist: number[] = [];
  if (count <= 0) return found;
  for (let i = 0; i < creeps.length; i++) {
    const c = creeps[i]!;
    if (c.hp <= 0 || !canHit(targets, c) || exclude.includes(c)) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2) continue;
    if (found.length === count && d2 >= dist[count - 1]!) continue;
    let j = found.length < count ? found.length : count - 1;
    while (j > 0 && dist[j - 1]! > d2) {
      found[j] = found[j - 1]!;
      dist[j] = dist[j - 1]!;
      j--;
    }
    found[j] = c;
    dist[j] = d2;
  }
  return found;
}

import type { Targeting } from '../../../content/original';
import { findCreep } from '../../combat/targeting';
import type { Creep, GameState, Tower } from '../../core/state';
import { creepLine } from '../../path/route';
import { canTarget, distance2, isPoisoned } from './combat';
import { peekTower, towerInfo } from './state';

// Targeting (docs/original-design.md §3): every attacking tower aims at First
// (default), Last, Strong or Close, and the player changes it freely. Poison
// towers prefer creeps that aren't poisoned yet, so one tower keeps several
// poisoned. Beams and Widow's Fang stick to their creep.

/** How far a creep still has to go to leak, along its route or air line; 0 off a line. */
export function remaining(state: GameState, creep: Creep): number {
  const line = creepLine(state.map, creep);
  return line ? line.leakAt - (creep.dist ?? 0) : 0;
}

/** Whether `a` is a better target than `b` for `mode` (ties go to the creep nearer its exit, then the older one). */
function better(state: GameState, mode: Targeting, tower: Tower, a: Creep, b: Creep): boolean {
  const ra = remaining(state, a);
  const rb = remaining(state, b);
  switch (mode) {
    case 'last':
      if (ra !== rb) return ra > rb;
      break;
    case 'strong':
      if (a.hp !== b.hp) return a.hp > b.hp;
      break;
    case 'close': {
      const da = distance2(a.x, a.y, tower.x, tower.y);
      const db = distance2(b.x, b.y, tower.x, tower.y);
      if (da !== db) return da < db;
      break;
    }
    case 'first':
      break;
  }
  if (ra !== rb) return ra < rb;
  return a.id < b.id;
}

/** Whether the tower can fire at this creep from where it stands: alive, reachable layer, within range and outside any minimum range. */
export function inReach(state: GameState, tower: Tower, creep: Creep, range: number): boolean {
  if (creep.hp <= 0 || !canTarget(state, tower, creep)) return false;
  const d2 = distance2(creep.x, creep.y, tower.x, tower.y);
  const min = towerInfo(tower.spec)?.minRange ?? 0;
  return d2 <= range * range && d2 >= min * min;
}

/** The creep a ready tower attacks (GameModeRules.towerTarget), or null to stay idle. */
export function pickTarget(state: GameState, tower: Tower, range: number): Creep | null {
  const info = towerInfo(tower.spec);
  if (!info || info.damageType === null) return null;
  if (info.sticky && tower.target !== 0) {
    const current = findCreep(state, tower.target);
    if (current && inReach(state, tower, current, range)) return current;
  }
  const mode = peekTower(state, tower.id)?.targeting ?? info.targeting;
  const preferFresh = info.poison !== undefined || info.cloud !== undefined;
  let best: Creep | null = null;
  let bestFresh = false;
  for (const c of state.creeps) {
    if (!inReach(state, tower, c, range)) continue;
    const fresh = preferFresh && !isPoisoned(c);
    if (best === null || (fresh && !bestFresh) || (fresh === bestFresh && better(state, mode, tower, c, best))) {
      best = c;
      bestFresh = fresh;
    }
  }
  return best;
}

/** Up to `count` more creeps the tower can fire at, best first by its targeting, skipping `exclude`. */
export function moreTargets(state: GameState, tower: Tower, range: number, count: number, exclude: readonly Creep[]): Creep[] {
  const out: Creep[] = [];
  const mode = peekTower(state, tower.id)?.targeting ?? towerInfo(tower.spec)?.targeting ?? 'first';
  for (let k = 0; k < count; k++) {
    let best: Creep | null = null;
    for (const c of state.creeps) {
      if (exclude.includes(c) || out.includes(c) || !inReach(state, tower, c, range)) continue;
      if (best === null || better(state, mode, tower, c, best)) best = c;
    }
    if (!best) break;
    out.push(best);
  }
  return out;
}

import { findCreep } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import type { Creep, GameState } from '../../core/state';
import { drop, isPoisoned } from './combat';
import { familyTalents } from './talents';
import { creepInfo, creepState, modeEvent, orState, peekCreep, ticks, type OriginalCreepState } from './state';
import { runHpScale, shieldAt } from './waves';

// Creep behaviour each tick (docs/original-design.md §5): regeneration, the
// Plague Mother's brood, and the Shield every Shieldbearer spawns with. Splits,
// enrage and the Riftlord's Shields happen on hits and deaths, in combat.ts.

/** A new creep's state (onSpawn): its Wave's Threat, its Shield and its boss timer. */
export function initCreep(state: GameState, creep: Creep): OriginalCreepState {
  const cs = creepState(state, creep);
  const info = creepInfo(creep.spec);
  // assumed: the Shield scales with Difficulty, as the Ghoul's HP it is a share of does.
  if (info?.shield) cs.shield = shieldAt(info.shield, cs.threat, runHpScale(state));
  if (info?.boss?.kind === 'brood') cs.next = state.tick + ticks(info.boss.every);
  return cs;
}

/** Drops the state of creeps no longer on the Map (kills and leaks delete their own; this catches the rest). */
export function pruneCreeps(state: GameState): void {
  const creeps = orState(state).creeps;
  const keys = Object.keys(creeps);
  if (keys.length <= state.creeps.length) return;
  for (const key of keys) {
    const c = findCreep(state, Number(key));
    if (!c || c.hp <= 0) delete creeps[key];
  }
}

/** Regeneration and broods. Runs every tick before creeps move. */
export function runCreepBehaviour(sim: Sim): void {
  const { state, events } = sim;
  const antivenom = familyTalents(state, 'poison').antivenom;
  const creeps = state.creeps;
  const n = creeps.length;
  for (let i = 0; i < n; i++) {
    const c = creeps[i]!;
    if (c.hp <= 0) continue;
    const info = creepInfo(c.spec);
    if (!info) continue;
    if (info.regen && c.hp < c.maxHp && !(antivenom && isPoisoned(c))) {
      c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * info.regen) / TICK_RATE);
    }
    const boss = info.boss;
    if (boss?.kind === 'brood') {
      const cs = peekCreep(state, c);
      if (cs && cs.next >= 0 && state.tick >= cs.next) {
        cs.next += ticks(boss.every);
        const brood = drop(sim, c, boss.creep, boss.count, 1);
        modeEvent(events, 'original.brood', { creep: c.id, into: brood.map((b) => b.id), x: c.x, y: c.y });
      }
    }
  }
}

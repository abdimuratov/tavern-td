import { MAX_ATTACK_RATE, MIN_ATTACK_RATE, MIN_SPEED_FACTOR, TICK_RATE } from '../core/constants';
import type { Sim } from '../core/mode';
import type { Creep, Tower } from '../core/state';
import { effectHandler, type CreepMods, type TowerMods } from './registry';
import { isStrongest } from './status';

const NO_CREEP_MODS: Readonly<CreepMods> = Object.freeze({ slow: 0, armor: 0, stunned: false, damageTaken: 0 });
const NO_TOWER_MODS: Readonly<TowerMods> = Object.freeze({ attackSpeed: 0, damage: 0, range: 0 });

export function creepMods(creep: Creep): Readonly<CreepMods> {
  const list = creep.status;
  if (list.length === 0) return NO_CREEP_MODS;
  const mods: CreepMods = { slow: 0, armor: 0, stunned: false, damageTaken: 0 };
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const h = effectHandler(s.kind);
    if (h?.creepMods && isStrongest(list, i)) h.creepMods(s, mods);
  }
  return mods;
}

export function towerMods(tower: Tower): Readonly<TowerMods> {
  const list = tower.status;
  if (list.length === 0) return NO_TOWER_MODS;
  const mods: TowerMods = { attackSpeed: 0, damage: 0, range: 0 };
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const h = effectHandler(s.kind);
    if (h?.towerMods && isStrongest(list, i)) h.towerMods(s, mods);
  }
  return mods;
}

export function speedFactor(mods: Readonly<CreepMods>): number {
  return mods.stunned ? 0 : Math.max(MIN_SPEED_FACTOR, 1 - mods.slow);
}

/** Ticks between attacks for a cooldown in seconds under an attack-speed bonus. */
export function cooldownTicks(cooldown: number, attackSpeed: number): number {
  const rate = Math.min(MAX_ATTACK_RATE, Math.max(MIN_ATTACK_RATE, 1 + attackSpeed));
  return (cooldown * TICK_RATE) / rate;
}

/** Runs the per-tick part of a creep's statuses (poison). Stops once the creep dies. */
export function tickCreepStatuses(sim: Sim, creep: Creep): void {
  const list = creep.status;
  for (let i = 0; i < list.length && creep.hp > 0; i++) {
    const s = list[i]!;
    const h = effectHandler(s.kind);
    if (h?.tickCreep && isStrongest(list, i)) h.tickCreep(s, creep, sim);
  }
}

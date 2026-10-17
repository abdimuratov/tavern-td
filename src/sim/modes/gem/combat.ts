import { SPELL_ATTACK_TYPE, type GemCreepSpec } from '../../../content/gem';
import { damageCreep, typeMultiplier } from '../../combat/damage';
import { applyStatus, statusTicks } from '../../combat/status';
import { canHit } from '../../combat/targeting';
import type { HitKind } from '../../core/events';
import type { Sim } from '../../core/mode';
import type { TargetLayer } from '../../core/specs';
import type { Creep } from '../../core/state';

// Damage and stun rules Gem TD+ changes from WC3 (docs/research/gem-td-rules.md §13).

/** Status keys. */
export const STUN = 'gem:stun';
const STUN_GUARD = 'gem:stun-guard';
/** A creep can't be stunned again for 0.1 s after a stun ends (src/unit/stun.j: 100 ms). */
const STUN_IMMUNITY_TICKS = 3;

/**
 * Gem TD+'s spell damage (burns, poison, novas, lightning, slate spells): the
 * Spells row of the damage table, no armor value.
 */
export function spellDamage(sim: Sim, creep: Creep, amount: number, tower: number, kind: HitKind): number {
  if (creep.hp <= 0 || amount <= 0) return 0;
  const armorType = sim.rules.creeps[creep.spec]?.armorType ?? '';
  return damageCreep(sim, creep, amount * typeMultiplier(sim.rules.damageTable, SPELL_ATTACK_TYPE, armorType), null, tower, kind);
}

export function isStunned(creep: Creep): boolean {
  return creep.status.some((s) => s.key === STUN);
}

/**
 * Gem TD+'s stun (src/unit/stun.j): refused for 0.1 s after a stun ends; a
 * longer stun on a stunned creep extends it. True when the creep is stunned now.
 */
export function stun(creep: Creep, seconds: number, tower: number): boolean {
  if (creep.hp <= 0 || seconds <= 0) return false;
  if (!isStunned(creep) && creep.status.some((s) => s.key === STUN_GUARD)) return false;
  const ticks = statusTicks(seconds);
  applyStatus(creep.status, 'gem.stun', STUN, 1, ticks, tower);
  applyStatus(creep.status, 'gem.stunGuard', STUN_GUARD, 1, ticks + STUN_IMMUNITY_TICKS, tower);
  return true;
}

export function isHero(sim: Sim, creep: Creep): boolean {
  return (sim.rules.creeps[creep.spec] as GemCreepSpec | undefined)?.hero === true;
}

/** Live creeps within `radius` of a point that the layer allows, in id order. */
export function creepsNear(sim: Sim, x: number, y: number, radius: number, layer: TargetLayer = 'both'): Creep[] {
  const r2 = radius * radius;
  const out: Creep[] = [];
  for (const c of sim.state.creeps) {
    if (c.hp <= 0 || !canHit(layer, c)) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    if (dx * dx + dy * dy <= r2) out.push(c);
  }
  return out;
}

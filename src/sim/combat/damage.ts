import { DEFAULT_ARMOR_FACTOR } from '../core/constants';
import type { HitKind } from '../core/events';
import { powDet } from '../core/math';
import type { Sim } from '../core/mode';
import type { DamageTable } from '../core/specs';
import type { Creep } from '../core/state';
import { earnGold } from '../economy';
import { creepMods } from './mods';
import { findTower } from './targeting';

/**
 * WC3 armor: positive armor A takes 0.06A / (1 + 0.06A) off the damage;
 * negative armor multiplies it by 2 − 0.94^(−A).
 */
export function armorMultiplier(armor: number, factor: number = DEFAULT_ARMOR_FACTOR): number {
  if (armor >= 0) return 1 / (1 + factor * armor);
  return 2 - powDet(1 - factor, -armor);
}

export function typeMultiplier(table: DamageTable, attackType: string, armorType: string): number {
  if (!Object.hasOwn(table, attackType)) return 1;
  const row = table[attackType]!;
  return Object.hasOwn(row, armorType) ? row[armorType]! : 1;
}

/** Warcraft III: The Frozen Throne's chart, as a starting table for Game Modes that use WC3 types. */
export const WC3_DAMAGE_TABLE: DamageTable = {
  normal: { light: 1, medium: 1.5, heavy: 1, fortified: 0.7, hero: 1, unarmored: 1, divine: 0.05 },
  pierce: { light: 2, medium: 0.75, heavy: 1, fortified: 0.35, hero: 0.5, unarmored: 1.5, divine: 0.05 },
  siege: { light: 1, medium: 0.5, heavy: 1, fortified: 1.5, hero: 0.5, unarmored: 1.5, divine: 0.05 },
  magic: { light: 1.25, medium: 0.75, heavy: 2, fortified: 0.35, hero: 0.5, unarmored: 1, divine: 0.05 },
  chaos: { light: 1, medium: 1, heavy: 1, fortified: 1, hero: 1, unarmored: 1, divine: 1 },
  spells: { light: 1, medium: 1, heavy: 1, fortified: 1, hero: 0.7, unarmored: 1, divine: 0.05 },
  hero: { light: 1, medium: 1, heavy: 1, fortified: 0.5, hero: 1, unarmored: 1, divine: 0.05 },
};

/**
 * Deals damage and handles the kill. With an attack type the damage table and
 * armor apply; with null (poison and other damage over time) it lands as is.
 * A damage-taken status scales either. Returns the damage dealt.
 */
export function damageCreep(sim: Sim, creep: Creep, amount: number, attackType: string | null, tower: number, kind: HitKind): number {
  if (creep.hp <= 0 || amount <= 0) return 0;
  let dealt = amount;
  const mods = creepMods(creep);
  if (attackType !== null) {
    const spec = sim.rules.creeps[creep.spec];
    const armor = (spec?.armor ?? 0) + mods.armor;
    dealt *= typeMultiplier(sim.rules.damageTable, attackType, spec?.armorType ?? '')
      * armorMultiplier(armor, sim.rules.armorFactor ?? DEFAULT_ARMOR_FACTOR);
  }
  if (mods.damageTaken !== 0) dealt *= 1 + mods.damageTaken;
  creep.hp -= dealt;
  if (kind !== 'dot') sim.events.push({ type: 'hit', creep: creep.id, tower, damage: dealt, kind });
  if (creep.hp <= 0) killCreep(sim, creep, tower);
  return dealt;
}

/** Kills a creep outright: pays its bounty, credits the tower, and tells the Game Mode. */
export function killCreep(sim: Sim, creep: Creep, tower: number): void {
  const { state, events } = sim;
  creep.hp = 0;
  const killer = tower !== 0 ? findTower(state, tower) : undefined;
  if (killer) killer.kills++;
  events.push({ type: 'kill', creep: creep.id, tower, bounty: creep.bounty, x: creep.x, y: creep.y });
  earnGold(state, creep.bounty, events);
  sim.rules.onKill?.(state, creep, tower, events);
}

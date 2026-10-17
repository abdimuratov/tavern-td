import { LEVEL_AURA, LEVEL_DAMAGE, PERKS, type PerkEffect } from '../../../content/original';
import { towerMods } from '../../combat/mods';
import type { TowerMods } from '../../combat/registry';
import { applyStatus, statusTicks } from '../../combat/status';
import { withBonus } from '../../combat/towers';
import { AURA_TICKS } from '../../core/constants';
import type { Sim } from '../../core/mode';
import type { GameState, Tower } from '../../core/state';
import { KEY, STATUS, applySlow, canTarget, distance2 } from './combat';
import { familyTalents } from './talents';
import { modeEvent, peekTower, ticks, towerInfo, towerSpec } from './state';

// Auras, Tower Level bonuses and the timed Perks (docs/original-design.md §6–7).
// Totem auras reach towers; War Totem, Hex and Blizzard Spire reach creeps.
// Two auras of the same kind don't stack: they share a key, and the strongest counts.

const AURA_KEY = {
  attackSpeed: 'original:aura:attackSpeed',
  damage: 'original:aura:damage',
  range: 'original:aura:range',
} as const;

/** The Perk a tower holds at Tower Level 5 (`which` 0) or 10 (`which` 1), or null. */
export function perkOf(state: GameState, tower: Tower, which: 0 | 1): PerkEffect | null {
  const info = towerInfo(tower.spec);
  const ts = peekTower(state, tower.id);
  if (!info || !ts || ts.level < (which === 0 ? 5 : 10)) return null;
  return PERKS[info.family][which].effect;
}

/**
 * The Game Mode's bonus on a tower (GameModeRules.towerBonus): +3% damage per
 * Tower Level above 1, its family's Talents, Leyline and Keen Eye. Range comes
 * as world units, a share of the tower's own range.
 */
export function towerBonus(state: GameState, tower: Tower): TowerMods | null {
  const spec = towerSpec(tower.spec);
  const atk = spec?.attack;
  if (!spec || !atk) return null;
  const info = spec.original;
  const ts = peekTower(state, tower.id);
  const t = familyTalents(state, info.family);
  let damage = t.damage + LEVEL_DAMAGE * ((ts?.level ?? 1) - 1);
  if (t.leyline) {
    const r2 = t.leyline.radius * t.leyline.radius;
    let others = 0;
    for (const u of state.towers) {
      if (u !== tower && towerInfo(u.spec)?.family === info.family && distance2(u.x, u.y, tower.x, tower.y) <= r2) others++;
    }
    damage += Math.min(t.leyline.max, t.leyline.per * others);
  }
  const keen = perkOf(state, tower, 0);
  const range = t.range + (keen?.kind === 'range' ? keen.value : 0);
  return { attackSpeed: t.attackSpeed, damage, range: atk.range * range };
}

/** A tower's statuses plus the Original's bonus. */
export function fullMods(state: GameState, tower: Tower): Readonly<TowerMods> {
  return withBonus(towerMods(tower), towerBonus(state, tower));
}

/** A tower's attack range right now, bonuses included; 0 for one that doesn't attack. */
export function attackRange(state: GameState, tower: Tower): number {
  const atk = towerSpec(tower.spec)?.attack;
  return atk ? atk.range + fullMods(state, tower).range : 0;
}

/** What multiplies a tower's damage right now (Levels, Talents, War Totem); 1 for a tower that's gone. */
export function damageFactor(state: GameState, towerId: number): number {
  const tower = state.towers.find((t) => t.id === towerId);
  return tower ? 1 + fullMods(state, tower).damage : 1;
}

/** How far a tower's auras reach: a Totem's 256 with Wide Circle and Wider Circle, a Blizzard Spire's attack range. */
export function auraRadius(state: GameState, tower: Tower): number {
  const info = towerInfo(tower.spec);
  const auras = info?.auras;
  if (!info || !auras) return 0;
  const base = auras.radius ?? attackRange(state, tower);
  if (info.family !== 'totem') return base;
  const wider = perkOf(state, tower, 0);
  return base * (1 + familyTalents(state, 'totem').auraRadius + (wider?.kind === 'auraRadius' ? wider.value : 0));
}

/** Refreshes every aura's status on the towers and creeps it reaches. Runs every tick before towers attack. */
export function runAuras(sim: Sim): void {
  const { state } = sim;
  const towers = state.towers;
  for (const t of towers) {
    const info = towerInfo(t.spec);
    const auras = info?.auras;
    if (!info || !auras) continue;
    const radius = auraRadius(state, t);
    const r2 = radius * radius;
    const totem = info.family === 'totem';
    const talents = familyTalents(state, 'totem');
    // assumed: Level points go to the percentage auras, not War Totem's armor; Rally adds range to every Totem.
    const points = totem ? LEVEL_AURA * ((peekTower(state, t.id)?.level ?? 1) - 1) : 0;
    const rally = totem ? talents.auraRange : 0;
    const attackSpeed = auras.attackSpeed !== undefined ? auras.attackSpeed + points + talents.auraAttackSpeed : 0;
    const damage = auras.damage !== undefined ? auras.damage + points : 0;
    const range = auras.range !== undefined || rally > 0 ? (auras.range ?? 0) + rally + points : 0;
    if (attackSpeed > 0 || damage > 0 || range > 0) {
      for (const u of towers) {
        const atk = towerSpec(u.spec)?.attack;
        if (!atk || distance2(u.x, u.y, t.x, t.y) > r2) continue;
        if (attackSpeed > 0) applyStatus(u.status, 'attackSpeed', AURA_KEY.attackSpeed, attackSpeed, AURA_TICKS, t.id);
        if (damage > 0) applyStatus(u.status, 'damage', AURA_KEY.damage, damage, AURA_TICKS, t.id);
        if (range > 0) applyStatus(u.status, 'range', AURA_KEY.range, atk.range * range, AURA_TICKS, t.id);
      }
    }
    const hex = totem ? talents.hex : 0;
    const slow = auras.slow !== undefined ? auras.slow + familyTalents(state, info.family).slowStrength : 0;
    if ((auras.armor ?? 0) <= 0 && slow <= 0 && hex <= 0) continue;
    for (const c of state.creeps) {
      if (c.hp <= 0 || distance2(c.x, c.y, t.x, t.y) > r2) continue;
      if (auras.armor !== undefined && auras.armor > 0) applyStatus(c.status, STATUS.armor, KEY.war, auras.armor, AURA_TICKS, t.id);
      if (hex > 0) applyStatus(c.status, STATUS.hex, KEY.hex, hex, AURA_TICKS, t.id);
      if (slow > 0) applySlow(state, c, slow, 0, t.id, AURA_TICKS);
    }
  }
}

/**
 * The timed Perks: Frost Nova (Frost, Level 5) and War Drums (Totem, Level 10).
 * assumed: they wait for creeps (Nova for one in range) rather than fire into nothing.
 */
export function runTimedPerks(sim: Sim): void {
  const { state, events } = sim;
  if (!state.creeps.some((c) => c.hp > 0)) return;
  for (const t of state.towers) {
    const info = towerInfo(t.spec);
    const ts = peekTower(state, t.id);
    if (!info || !ts || ts.level < 5 || state.tick < ts.perkAt) continue;
    if (info.family === 'frost') {
      const nova = perkOf(state, t, 0);
      if (nova?.kind !== 'nova') continue;
      const range = attackRange(state, t);
      const r2 = range * range;
      const inRange = state.creeps.filter((c) => c.hp > 0 && canTarget(state, t, c) && distance2(c.x, c.y, t.x, t.y) <= r2);
      if (inRange.length === 0) continue;
      const frost = familyTalents(state, 'frost');
      for (const c of inRange) applySlow(state, c, nova.slow + frost.slowStrength, nova.duration + frost.slowDuration, t.id);
      ts.perkAt = state.tick + ticks(nova.every);
      modeEvent(events, 'original.frostNova', { tower: t.id, creeps: inRange.length });
    } else if (info.family === 'totem') {
      const drums = perkOf(state, t, 1);
      if (drums?.kind !== 'drums') continue;
      const r = auraRadius(state, t);
      for (const u of state.towers) {
        if (!towerSpec(u.spec)?.attack || distance2(u.x, u.y, t.x, t.y) > r * r) continue;
        applyStatus(u.status, 'attackSpeed', KEY.drums, drums.value, statusTicks(drums.duration), t.id);
      }
      ts.perkAt = state.tick + ticks(drums.every);
      modeEvent(events, 'original.warDrums', { tower: t.id });
    }
  }
}

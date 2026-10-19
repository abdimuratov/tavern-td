import {
  ORIGINAL_CREEPS, ORIGINAL_TOWERS,
  type ArmorType, type DamageType, type Family, type OriginalCreepSpec, type OriginalTowerSpec, type Region, type Targeting,
} from '../../../content/original';
import { num } from '../../format';

// Player-facing words for the Original, written from the specs so the numbers
// can't drift from the rules. The tone is the design doc's (§2): grim, spare
// and straight, with no jokes. Short enough for a phone HUD.

export function towerSpecOf(id: string): OriginalTowerSpec | undefined {
  return Object.hasOwn(ORIGINAL_TOWERS, id) ? ORIGINAL_TOWERS[id] : undefined;
}

export function creepSpecOf(id: string): OriginalCreepSpec | undefined {
  return Object.hasOwn(ORIGINAL_CREEPS, id) ? ORIGINAL_CREEPS[id] : undefined;
}

export const FAMILY_NAME: Readonly<Record<Family, string>> = {
  arrow: 'Arrow', cannon: 'Cannon', frost: 'Frost', arcane: 'Arcane', poison: 'Poison', totem: 'Totem',
};

export const REGION_NAME: Readonly<Record<Region, string>> = {
  ashfield: 'Ashfield', blightfen: 'Blightfen', rift: 'Rift',
};

export const REGIONS: readonly Region[] = ['ashfield', 'blightfen', 'rift'];

/** Each Region's two-line intro on the Stage-select screen. */
export const REGION_INTRO: Readonly<Record<Region, readonly [string, string]>> = {
  ashfield: ['The March is burning. The dead walk its farms and fill its river.', 'Hold the old road through the ash, fort by fort.'],
  blightfen: ['Plague follows the dead into the drowned villages.', 'The cults that spread it wade out of the marsh to meet you.'],
  rift: ['Beyond the northern pass the sky is torn open.', 'The demons come through last. Close the road to them.'],
};

/** One line from each boss as it takes the road. */
export const BOSS_LINE: Readonly<Record<string, string>> = {
  gravelord: 'Gravelord: "Your dead march for me now."',
  plague_mother: 'Plague Mother: "Every one of you will feed my brood."',
  riftlord: 'Riftlord: "The Rift does not close. It only widens."',
};

/**
 * Where each Stage's pin sits on the war map, in percent from its top-left
 * corner: the road climbs from Ashfield in the south to the Rift in the north.
 */
export const PIN_AT: Readonly<Record<number, readonly [x: number, y: number]>> = {
  1: [14, 88], 2: [33, 80], 3: [53, 86], 4: [74, 77],
  5: [86, 60], 6: [65, 54], 7: [43, 60], 8: [20, 51],
  9: [16, 32], 10: [38, 24], 11: [61, 30], 12: [84, 13],
};

export const TARGETING_NAME: Readonly<Record<Targeting, string>> = {
  first: 'First', last: 'Last', strong: 'Strong', close: 'Close',
};

export const TARGETING_ABOUT: Readonly<Record<Targeting, string>> = {
  first: 'the creep nearest its exit',
  last: 'the creep furthest from its exit',
  strong: 'the creep with the most HP',
  close: 'the creep nearest the tower',
};

export const DAMAGE_NAME: Readonly<Record<DamageType, string>> = {
  pierce: 'Pierce', siege: 'Siege', magic: 'Magic', poison: 'Poison',
};

export const ARMOR_NAME: Readonly<Record<ArmorType, string>> = {
  unarmored: 'Unarmored', armored: 'Armored', warded: 'Warded', boss: 'Boss',
};

export function pct(fraction: number): string {
  return `${num(Math.round(fraction * 1000) / 10)}%`;
}

/** Seconds as a player reads them: "2 s", "0.5 s". */
export function secs(s: number): string {
  return `${num(Math.round(s * 100) / 100)} s`;
}

/** Attacks per second. */
export function rate(cooldown: number): string {
  return `${num(Math.round((1 / cooldown) * 100) / 100)}/s`;
}

/** m:ss, rounding up so a countdown reaches 0:00 as it ends. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Tier 2", or "Specialisation" past Tier 3. */
export function tierName(tier: number): string {
  return tier >= 4 ? 'Specialisation' : `Tier ${tier}`;
}

/** What a tower does beyond its plain hit, one short line each. */
export function abilityLines(spec: OriginalTowerSpec): string[] {
  const i = spec.original;
  const out: string[] = [];
  if (i.multishot) out.push(`Fires ${i.multishot} arrows at ${i.multishot} creeps`);
  if (i.beam) out.push(`A beam: +${pct(i.beam.ramp)} for each second on one creep, up to ×${num(i.beam.max)}`);
  if (i.bounce) out.push(`The bolt jumps to ${i.bounce.jumps} more creeps, −${pct(i.bounce.falloff)} each jump`);
  if (i.splash) out.push(`Splash: full within ${num(i.splash.full)}, half within ${num(i.splash.half)}`);
  if (i.minRange) out.push(`Can't fire within ${num(i.minRange)}`);
  if (i.nova) out.push('Each attack hits every creep in range');
  if (i.slow) out.push(`Slows ${pct(i.slow.amount)} for ${secs(i.slow.duration)}`);
  if (i.auras?.slow) out.push(`Slows every creep in range ${pct(i.auras.slow)}`);
  if (i.freeze) out.push(`${pct(i.freeze.chance)} of hits freeze for ${secs(i.freeze.duration)}`);
  if (i.poison) out.push(`Poisons ${num(i.poison.dps)}/s for ${secs(i.poison.duration)}; prefers creeps not yet poisoned`);
  if (i.stacks) out.push(`Each hit adds ${num(i.stacks.dps)}/s of poison for ${secs(i.stacks.duration)}, up to ${i.stacks.max} stacks`);
  if (i.cloud) out.push(`Lobs a cloud, radius ${num(i.cloud.radius)}, that poisons ${num(i.cloud.dps)}/s for ${secs(i.cloud.duration)}`);
  if (i.crit) out.push(`${pct(i.crit.chance)} of hits crit ×${num(i.crit.multiplier)}`);
  if (i.ignoresArmored) out.push('Hits Armored creeps as if Unarmored');
  if (i.sticky && !i.beam) out.push('Keeps its target while it lives');
  const a = i.auras;
  if (a && (a.attackSpeed || a.damage || a.range || a.armor)) {
    const parts = [
      a.attackSpeed ? `+${pct(a.attackSpeed)} attack speed` : '',
      a.damage ? `+${pct(a.damage)} damage` : '',
      a.range ? `+${pct(a.range)} range` : '',
    ].filter(Boolean);
    if (parts.length > 0) out.push(`Towers within ${num(a.radius ?? 0)}: ${parts.join(', ')}`);
    if (a.armor) out.push(`Creeps within ${num(a.radius ?? 0)}: −${num(a.armor)} armor`);
  }
  return out;
}

/** A tower in one line, for an upgrade button: its hit, its speed and what it adds. */
export function towerSummary(spec: OriginalTowerSpec): string {
  const atk = spec.attack;
  const lines = abilityLines(spec);
  if (!atk) return lines[0] ?? '';
  const hit = spec.original.beam ? `${num(Math.round(atk.damage[0] / atk.cooldown))}/s beam` : `${num(atk.damage[0])} dmg · ${rate(atk.cooldown)}`;
  const extra = spec.original.beam ? lines[1] : lines[0];
  return [hit, extra].filter(Boolean).join(' · ');
}

/** Small tags for a creep in the wave preview: its armor, its defences and what it does. */
export function creepTags(spec: OriginalCreepSpec): string[] {
  const i = spec.original;
  const tags: string[] = [];
  if (spec.armorType === 'armored') tags.push('Armored');
  if (spec.armorType === 'warded') tags.push('Warded');
  if (i.shield) tags.push('Shield');
  if (i.regen && !i.boss) tags.push('Regen');
  if (i.split) tags.push('Splits');
  if (spec.speed >= 220) tags.push('Fast');
  return tags;
}

/** A creep's tooltip: what it is and how it fights. */
export function creepAbout(spec: OriginalCreepSpec): string {
  const i = spec.original;
  const parts = [`${ARMOR_NAME[spec.armorType]}`, `speed ${num(spec.speed)}`, `a Leak costs ${i.lives} ${i.lives === 1 ? 'life' : 'lives'}`];
  return [...parts, ...creepTraitLines(spec)].join(' · ');
}

/** How a creep fights beyond its HP, armor and speed, one short line each: its Shield, regeneration, split and boss behaviour. */
export function creepTraitLines(spec: OriginalCreepSpec): string[] {
  const i = spec.original;
  const parts: string[] = [];
  if (i.shield) parts.push('its Shield blocks a flat amount from every hit; poison ignores it');
  if (i.regen) parts.push(`regains ${pct(i.regen)} of its HP each second`);
  if (i.split) parts.push(`bursts into ${i.split.count} ${creepSpecOf(i.split.creep)?.name ?? i.split.creep}s`);
  const b = i.boss;
  if (b?.kind === 'enrage') parts.push(`at ${pct(b.at)} HP it enrages: +${pct(b.haste)} speed for ${secs(b.duration)}`);
  if (b?.kind === 'brood') parts.push(`every ${secs(b.every)} drops ${b.count} ${creepSpecOf(b.creep)?.name ?? b.creep}s behind it`);
  if (b?.kind === 'rift') parts.push(`at ${b.at.map(pct).join(', ')} HP it raises a Shield and calls ${b.count} ${creepSpecOf(b.creep)?.name ?? b.creep}s`);
  return parts;
}

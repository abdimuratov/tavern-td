import {
  MAUL_CREEPS, MAUL_TOWERS, RACE_SPECS,
  type ArmorType, type AttackType, type CreepKind, type MaulCreepSpec, type MaulTowerSpec, type RaceId,
} from '../../../content/maul';
import type { EffectSpec } from '../../../sim';
import { num } from '../../format';

// Maul's words: names for its types and kinds, and one-line summaries of towers.

export const ATTACK_NAME: Readonly<Record<AttackType, string>> = {
  pierce: 'Pierce', siege: 'Siege', frost: 'Frost', magic: 'Magic', chaos: 'Chaos',
};

export const ARMOR_NAME: Readonly<Record<ArmorType, string>> = {
  light: 'Light', medium: 'Medium', heavy: 'Heavy', fortified: 'Fortified', hero: 'Hero',
};

/** The attack that hits each armor type hardest, for the wave preview. */
export const BEST_AGAINST: Readonly<Record<ArmorType, string>> = {
  light: 'Pierce', medium: 'Frost', heavy: 'Magic', fortified: 'Siege', hero: 'any attack alike',
};

/** A creep kind's tag in the wave preview, or null for a plain creep. */
export const KIND_TAG: Readonly<Record<CreepKind, string | null>> = {
  normal: null, swarm: 'Swarm', fast: 'Fast', brute: 'Armored', golem: 'Fortified', regen: 'Regen', unslowable: 'Unslowable',
  air: 'Air', boss: 'Boss',
};

export function towerSpecOf(spec: string): MaulTowerSpec | undefined {
  return Object.hasOwn(MAUL_TOWERS, spec) ? MAUL_TOWERS[spec] : undefined;
}

export function creepSpecOf(spec: string): MaulCreepSpec | undefined {
  return Object.hasOwn(MAUL_CREEPS, spec) ? MAUL_CREEPS[spec] : undefined;
}

export function raceName(race: RaceId): string {
  return RACE_SPECS[race].name;
}

export function racesText(races: readonly RaceId[]): string {
  return races.map(raceName).join(' and ');
}

/** "Wall", "Tier 2". */
export function tierName(tier: number): string {
  return tier === 0 ? 'Wall' : `Tier ${tier}`;
}

export function rate(cooldown: number): string {
  return `${num(Math.round((1 / cooldown) * 100) / 100)}/s`;
}

/** m:ss, rounding up so a countdown reaches 0:00 as it ends. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function effectLine(e: EffectSpec): string | null {
  const x = e as { kind: string } & Record<string, number | string | undefined>;
  switch (x.kind) {
    case 'splash': return 'Splashes everything near where it lands';
    case 'slow': return `Slows by ${Math.round(Number(x['amount']) * 100)}% for ${num(Number(x['duration']))} s`;
    case 'stun': return `${Math.round(Number(x['chance']) * 100)}% of hits stun for ${num(Number(x['duration']))} s`;
    case 'crit': return `${Math.round(Number(x['chance']) * 100)}% of hits deal ×${num(Number(x['multiplier']))}`;
    case 'multishot': return `Hits ${num(Number(x['count']))} creeps at once`;
    case 'maul.venom': return `Venom: ${num(Number(x['dps']))} a second for ${num(Number(x['duration']))} s, past armor`;
    case 'maul.spread': return `Spores poison every ground creep near the burst: ${num(Number(x['dps']))} a second${x['armor'] ? `, and −${num(Number(x['armor']))} armor` : ''}`;
    case 'maul.chain': return `Jumps to ${num(Number(x['jumps']))} more creeps, ${Math.round(Number(x['falloff']) * 100)}% weaker each jump`;
    default: return null;
  }
}

/** What a tower does beyond its hits, one line each. */
export function abilityLines(spec: MaulTowerSpec): string[] {
  const out: string[] = [];
  for (const e of spec.attack?.effects ?? []) {
    const line = effectLine(e);
    if (line) out.push(line);
  }
  for (const a of spec.auras ?? []) {
    if (a.kind === 'slow') out.push(`Slows every creep within ${num(a.radius)} by ${Math.round(a.value * 100)}%`);
    else if (a.kind === 'armor') out.push(`Creeps within ${num(a.radius)} lose ${num(a.value)} armor`);
    else if (a.kind === 'poison') out.push(`Every ground creep within ${num(a.radius)} rots for ${num(a.value)} a second`);
    else if (a.kind === 'damage') out.push(`Towers within ${num(a.radius)} deal ${Math.round(a.value * 100)}% more damage`);
    else if (a.kind === 'attackSpeed') out.push(`Towers within ${num(a.radius)} attack ${Math.round(a.value * 100)}% faster`);
  }
  return out;
}

/** "Pierce · 7 dmg · 0.71/s · ground and air". */
export function towerSummary(spec: MaulTowerSpec): string {
  const a = spec.attack;
  if (!a) return spec.maul.role;
  const avg = (a.damage[0] + a.damage[1]) / 2;
  const hits = a.targets === 'both' ? 'ground and air' : a.targets === 'ground' ? 'ground only' : 'air only';
  return `${ATTACK_NAME[a.attackType as AttackType]} · ${num(avg)} dmg · ${rate(a.cooldown)} · ${hits}`;
}

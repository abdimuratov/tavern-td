import type { AttackSpec, AuraSpec, EffectSpec, TargetLayer } from '../../sim';
import {
  GEM_TYPES, QUALITIES,
  type BarrageSpec, type GemFrostEffect, type GemPoisonEffect, type GemTowerSpec, type GemType, type Quality,
} from './types';

// The 8 gem types × 6 qualities (docs/research/gem-td-rules.md §5), from
// war3map.w3u ua1b/ua1s/ua1c/ua1r/ua1z after the Lua patches. Every basic gem
// rolls one die, so damage is a uniform whole-number roll over [min, max].
// Base WC3 fields the map leaves unset are current-patch defaults (assumed), e.g.
// Flawless Amethyst's projectile speed 1800 from the guard tower.

/** Spec id of a basic gem, e.g. `amethyst-chipped`. */
export function gemId(type: GemType, quality: Quality): string {
  return `${type}-${quality}`;
}

const QUALITY_NAME: Readonly<Record<Quality, string>> = {
  chipped: 'Chipped', flawed: 'Flawed', normal: 'Normal', flawless: 'Flawless', perfect: 'Perfect', great: 'Great',
};

const TYPE_NAME: Readonly<Record<GemType, string>> = {
  amethyst: 'Amethyst', aquamarine: 'Aquamarine', diamond: 'Diamond', emerald: 'Emerald',
  opal: 'Opal', ruby: 'Ruby', sapphire: 'Sapphire', topaz: 'Topaz',
};

export function gemName(type: GemType, quality: Quality): string {
  return `${QUALITY_NAME[quality]} ${TYPE_NAME[type]}`;
}

export function typeName(type: GemType): string {
  return TYPE_NAME[type];
}

export function qualityName(quality: Quality): string {
  return QUALITY_NAME[quality];
}

/** [min damage, max damage, cooldown s, range, projectile speed], Chipped to Great. */
type Row = readonly [number, number, number, number, number];

interface TypeTable {
  readonly attackType: string;
  readonly targets: TargetLayer;
  readonly rows: readonly [Row, Row, Row, Row, Row, Row];
}

const TABLE: Readonly<Record<GemType, TypeTable>> = {
  // Long range, air only. Great adds a −3 armor aura (A03Q).
  amethyst: { attackType: 'pierce', targets: 'air', rows: [
    [10, 15, 0.8, 1000, 1200], [20, 27, 1, 1200, 1400], [30, 45, 1, 1300, 1500],
    [60, 80, 1, 1350, 1800], [140, 170, 1, 1600, 1900], [350, 400, 1, 1650, 1900],
  ] },
  // Fast and short. Great adds a +10% attack-speed aura (S000).
  aquamarine: { attackType: 'magic', targets: 'both', rows: [
    [6, 8, 0.5, 350, 1000], [12, 15, 0.5, 365, 1000], [24, 30, 0.5, 380, 1000],
    [48, 55, 0.5, 400, 1000], [100, 120, 0.5, 550, 1000], [280, 280, 0.5, 600, 1000],
  ] },
  // Ground only, Critical Strike (ACct).
  diamond: { attackType: 'normal', targets: 'ground', rows: [
    [8, 12, 0.8, 500, 950], [16, 18, 1, 550, 900], [30, 37, 1, 600, 850],
    [58, 65, 1, 650, 900], [140, 150, 1, 750, 1200], [300, 350, 1, 850, 1900],
  ] },
  // Poison (Aspo, share/objects/emerald-poison-kill.lua).
  emerald: { attackType: 'siege', targets: 'both', rows: [
    [4, 7, 0.8, 500, 700], [10, 13, 1, 550, 750], [15, 25, 1, 600, 700],
    [30, 37, 1, 700, 700], [80, 95, 1, 900, 700], [275, 275, 1, 900, 1500],
  ] },
  // Attack-speed aura (S008), its WC3 ability level set by the quality.
  opal: { attackType: 'magic', targets: 'both', rows: [
    [5, 5, 0.8, 600, 600], [10, 10, 1, 700, 1200], [20, 20, 1, 800, 1000],
    [40, 40, 1, 900, 900], [85, 85, 1, 1000, 1350], [180, 180, 1, 1500, 1200],
  ] },
  // Artillery splash (share/objects/ruby-splash.lua). Great Ruby is a missile with Barrage instead.
  ruby: { attackType: 'hero', targets: 'both', rows: [
    [8, 9, 1, 800, 1400], [13, 16, 1, 800, 1400], [20, 25, 1, 800, 1500],
    [38, 45, 1, 800, 1600], [80, 100, 1, 900, 1700], [140, 140, 0.5, 900, 1700],
  ] },
  // Frost Attack (Afra).
  sapphire: { attackType: 'spells', targets: 'both', rows: [
    [5, 8, 0.8, 550, 1250], [10, 14, 1, 750, 1300], [16, 22, 1, 800, 1300],
    [30, 40, 1, 850, 1200], [60, 80, 1, 1400, 1300], [200, 250, 1, 2000, 1900],
  ] },
  // Barrage (Aroc); range from share/objects/change-topaz-base.lua.
  topaz: { attackType: 'chaos', targets: 'both', rows: [
    [4, 4, 0.8, 500, 900], [8, 8, 1, 500, 900], [14, 14, 1, 500, 900],
    [25, 25, 1, 500, 900], [75, 75, 1, 600, 900], [250, 250, 1, 700, 900],
  ] },
};

/** Emerald poison per second by quality (A002 … A01J after emerald-poison-kill.lua): 6 s, 20% slow, can kill. */
const EMERALD_POISON = [2, 4, 8, 16, 40, 100] as const;

/** Opal's aura (S008): attack-speed bonus and radius by quality. The same buff never stacks: the strongest wins. */
const OPAL_AURA = [[0.1, 600], [0.15, 700], [0.2, 800], [0.25, 900], [0.35, 1000], [0.5, 1500]] as const;

/** Topaz Barrage by quality (A00X, A00Y, A00Z, A010, A011, A01F): damage × targets within radius, every 1 s. */
const TOPAZ_BARRAGE = [[4, 1, 500], [8, 2, 500], [14, 3, 500], [25, 4, 500], [75, 7, 600], [250, 7, 700]] as const;

/**
 * WC3 Frost Attack in Gem TD+: 20% move slow (FrostMoveSpeedDecrease 0.2 in
 * share/constants/gameplay/gem.lua), 5 s, 3 s on heroes. The 25% attack slow
 * doesn't matter: creeps never attack.
 */
export const FROST: GemFrostEffect = { kind: 'gem.frost', amount: 0.2, duration: 5, heroDuration: 3 };

function poison(dps: number, duration: number): GemPoisonEffect {
  return { kind: 'gem.poison', dps, duration, slow: 0.2 };
}

function gemSpec(type: GemType, qi: number): GemTowerSpec {
  const quality = QUALITIES[qi]!;
  const t = TABLE[type];
  const [min, max, cooldown, range, projectileSpeed] = t.rows[qi]!;
  const great = quality === 'great';
  const effects: EffectSpec[] = [];
  const auras: AuraSpec[] = [];
  let barrage: BarrageSpec | undefined;
  switch (type) {
    case 'amethyst':
      if (great) auras.push({ kind: 'armor', to: 'creeps', radius: 1000, value: 3, key: 'gem:great-amethyst' });
      break;
    case 'aquamarine':
      if (great) auras.push({ kind: 'attackSpeed', to: 'towers', radius: 1500, value: 0.1, key: 'gem:great-aquamarine' });
      break;
    case 'diamond':
      effects.push({ kind: 'crit', chance: 0.25, multiplier: great ? 5 : 2 });
      break;
    case 'emerald':
      effects.push(poison(EMERALD_POISON[qi]!, 6));
      break;
    case 'opal': {
      const [value, radius] = OPAL_AURA[qi]!;
      auras.push({ kind: 'attackSpeed', to: 'towers', radius, value, key: 'gem:opal' });
      break;
    }
    case 'ruby':
      // Splash hits ground only (splash targets "debris,ground,…"); a primary air target is still hit (assumed).
      if (great) barrage = { damage: 140, targets: 1, radius: 900, cooldown: 0.5 };
      else effects.push({ kind: 'splash', bands: [[200, 1], [220, 0.5], [240, 0.1]], targets: 'ground' });
      break;
    case 'sapphire':
      effects.push(FROST);
      break;
    case 'topaz': {
      const [damage, targets, radius] = TOPAZ_BARRAGE[qi]!;
      barrage = { damage, targets, radius, cooldown: 1 };
      break;
    }
  }
  const attack: AttackSpec = {
    damage: [min, max], cooldown, range, attackType: t.attackType, targets: t.targets, projectileSpeed,
    ...(effects.length > 0 ? { effects } : {}),
  };
  return {
    name: gemName(type, quality),
    footprint: 2,
    attack,
    ...(auras.length > 0 ? { auras } : {}),
    gem: { kind: 'gem', type, quality, ...(barrage ? { barrage } : {}) },
  };
}

/** All 48 basic gems by spec id. */
export const GEM_GEMS: Readonly<Record<string, GemTowerSpec>> = Object.fromEntries(
  GEM_TYPES.flatMap((type) => QUALITIES.map((q, qi) => [gemId(type, q), gemSpec(type, qi)] as const)),
);

/** A Draft gem that wasn't kept: a permanent 2 × 2 wall (h00G), removable for free. */
export const ROCK = 'rock';

export const ROCK_SPEC: GemTowerSpec = { name: 'Rock', footprint: 2, gem: { kind: 'rock' } };

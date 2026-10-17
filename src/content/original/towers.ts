import type { AttackSpec, TargetLayer } from '../../sim';
import type { DamageType, Family, OriginalTowerInfo, OriginalTowerSpec } from './types';

// The Original's 30 towers (docs/original-design.md §6): six Tower Families of
// Tiers 1–3 and two Specialisations each. Every tower is 2 × 2 and stands on a
// Build Spot. Each attacking tower carries one `original.attack` effect that
// lands its hits by the rules in src/sim/modes/original/attack.ts.
//
// assumed: projectile speeds, which the doc leaves open. Slow shots (Cannon,
// Thunder Mortar) are the ones Hounds punish; beams, novas and lightning are instant.

/** Every tower's footprint: one Build Spot. */
export const TOWER_FOOTPRINT = 2;

/** Seconds between beam ticks: the Arcane Lance deals its damage per second in tenths. */
export const BEAM_TICK = 0.1;

/** assumed: Frost's slows last 2 s at every Tier (the doc gives the duration only for Tier 1). */
const FROST_SLOW = 2;

interface Attack {
  readonly damage: number;
  readonly cooldown: number;
  readonly range: number;
  readonly targets: TargetLayer;
  /** World units per second; 0 lands at once. */
  readonly speed: number;
}

function attackOf(id: string, type: DamageType, a: Attack): AttackSpec {
  return {
    damage: [a.damage, a.damage], cooldown: a.cooldown, range: a.range, attackType: type, targets: a.targets,
    projectileSpeed: a.speed, direct: false, effects: [{ kind: 'original.attack', tower: id }],
  };
}

type Info = Omit<OriginalTowerInfo, 'family' | 'damageType' | 'targeting'> & Partial<Pick<OriginalTowerInfo, 'targeting'>>;

function tower(id: string, name: string, family: Family, type: DamageType | null, info: Info, attack?: Attack): [string, OriginalTowerSpec] {
  const original: OriginalTowerInfo = { ...info, family, damageType: type, targeting: info.targeting ?? 'first' };
  const spec: OriginalTowerSpec = attack && type
    ? { name, cost: info.price, footprint: TOWER_FOOTPRINT, attack: attackOf(id, type, attack), original }
    : { name, cost: info.price, footprint: TOWER_FOOTPRINT, original };
  return [id, spec];
}

const ARROW = 1600;
const CANNON = 900;
const FROST = 1200;
const ARCANE = 1000;
const POISON = 1000;

const ROWS: readonly [string, OriginalTowerSpec][] = [
  // Arrow: Pierce, cheap and fast, hits ground and air.
  tower('arrow_tower', 'Arrow Tower', 'arrow', 'pierce', { tier: 1, price: 70, total: 70, next: ['longbow_tower'] },
    { damage: 6, cooldown: 0.85, range: 320, targets: 'both', speed: ARROW }),
  tower('longbow_tower', 'Longbow Tower', 'arrow', 'pierce', { tier: 2, price: 110, total: 180, next: ['marksman_tower'] },
    { damage: 14, cooldown: 0.85, range: 352, targets: 'both', speed: ARROW }),
  tower('marksman_tower', 'Marksman Tower', 'arrow', 'pierce', { tier: 3, price: 165, total: 345, next: ['ranger_lodge', 'deadeye_perch'] },
    { damage: 26, cooldown: 0.85, range: 384, targets: 'both', speed: ARROW }),
  tower('ranger_lodge', 'Ranger Lodge', 'arrow', 'pierce', { tier: 4, price: 250, total: 595, next: [], multishot: 3 },
    { damage: 18, cooldown: 0.6, range: 384, targets: 'both', speed: ARROW }),
  tower('deadeye_perch', 'Deadeye Perch', 'arrow', 'pierce', {
    tier: 4, price: 250, total: 595, next: [], targeting: 'strong', crit: { chance: 0.2, multiplier: 2.5 }, ignoresArmored: true,
  }, { damage: 85, cooldown: 2.2, range: 576, targets: 'both', speed: 2400 }),

  // Cannon: Siege splash, ground only (Flak Battery hits air too).
  tower('cannon_tower', 'Cannon Tower', 'cannon', 'siege', { tier: 1, price: 90, total: 90, next: ['bombard'], splash: { full: 48, half: 112 } },
    { damage: 9, cooldown: 1.8, range: 288, targets: 'ground', speed: CANNON }),
  tower('bombard', 'Bombard', 'cannon', 'siege', { tier: 2, price: 140, total: 230, next: ['great_bombard'], splash: { full: 48, half: 112 } },
    { damage: 22, cooldown: 1.8, range: 304, targets: 'ground', speed: CANNON }),
  tower('great_bombard', 'Great Bombard', 'cannon', 'siege', {
    tier: 3, price: 210, total: 440, next: ['thunder_mortar', 'flak_battery'], splash: { full: 48, half: 112 },
  }, { damage: 40, cooldown: 1.8, range: 320, targets: 'ground', speed: CANNON }),
  tower('thunder_mortar', 'Thunder Mortar', 'cannon', 'siege', {
    tier: 4, price: 300, total: 740, next: [], minRange: 160, splash: { full: 80, half: 176 },
  }, { damage: 90, cooldown: 3.0, range: 640, targets: 'ground', speed: 600 }),
  tower('flak_battery', 'Flak Battery', 'cannon', 'siege', { tier: 4, price: 300, total: 740, next: [], splash: { full: 40, half: 88 } },
    { damage: 30, cooldown: 0.9, range: 384, targets: 'both', speed: 1400 }),

  // Frost: Magic and slows. Slows share one key, so only the strongest applies.
  tower('frost_tower', 'Frost Tower', 'frost', 'magic', { tier: 1, price: 80, total: 80, next: ['ice_spire'], slow: { amount: 0.25, duration: FROST_SLOW } },
    { damage: 4, cooldown: 1.2, range: 288, targets: 'both', speed: FROST }),
  tower('ice_spire', 'Ice Spire', 'frost', 'magic', { tier: 2, price: 120, total: 200, next: ['glacier_spire'], slow: { amount: 0.32, duration: FROST_SLOW } },
    { damage: 9, cooldown: 1.2, range: 304, targets: 'both', speed: FROST }),
  tower('glacier_spire', 'Glacier Spire', 'frost', 'magic', {
    tier: 3, price: 180, total: 380, next: ['blizzard_spire', 'rime_lance'], slow: { amount: 0.4, duration: FROST_SLOW },
  }, { damage: 16, cooldown: 1.2, range: 320, targets: 'both', speed: FROST }),
  tower('blizzard_spire', 'Blizzard Spire', 'frost', 'magic', { tier: 4, price: 270, total: 650, next: [], nova: true, auras: { slow: 0.45 } },
    { damage: 14, cooldown: 1.0, range: 256, targets: 'both', speed: 0 }),
  tower('rime_lance', 'Rime Lance', 'frost', 'magic', {
    tier: 4, price: 270, total: 650, next: [], slow: { amount: 0.4, duration: FROST_SLOW }, freeze: { chance: 0.2, duration: 1 },
  }, { damage: 55, cooldown: 1.4, range: 352, targets: 'both', speed: 1400 }),

  // Arcane: Magic, big single hits.
  tower('mage_tower', 'Mage Tower', 'arcane', 'magic', { tier: 1, price: 100, total: 100, next: ['sorcerer_tower'] },
    { damage: 17, cooldown: 1.7, range: 320, targets: 'both', speed: ARCANE }),
  tower('sorcerer_tower', 'Sorcerer Tower', 'arcane', 'magic', { tier: 2, price: 150, total: 250, next: ['archmage_tower'] },
    { damage: 38, cooldown: 1.7, range: 336, targets: 'both', speed: ARCANE }),
  tower('archmage_tower', 'Archmage Tower', 'arcane', 'magic', { tier: 3, price: 225, total: 475, next: ['arcane_lance', 'prism_tower'] },
    { damage: 70, cooldown: 1.7, range: 352, targets: 'both', speed: ARCANE }),
  // assumed: the beam keeps its creep while it lives and stays in range, since a new target resets the ramp.
  tower('arcane_lance', 'Arcane Lance', 'arcane', 'magic', { tier: 4, price: 330, total: 805, next: [], sticky: true, beam: { ramp: 0.25, max: 3 } },
    { damage: 40 * BEAM_TICK, cooldown: BEAM_TICK, range: 352, targets: 'both', speed: 0 }),
  // assumed: each jump looks for the nearest unhit creep within 192 of the last one.
  tower('prism_tower', 'Prism Tower', 'arcane', 'magic', {
    tier: 4, price: 330, total: 805, next: [], bounce: { jumps: 3, falloff: 0.25, radius: 192 },
  }, { damage: 60, cooldown: 1.5, range: 352, targets: 'both', speed: 1300 }),

  // Poison: damage over time that skips armor and Shields, ground only.
  tower('venom_dart', 'Venom Dart', 'poison', 'poison', { tier: 1, price: 80, total: 80, next: ['venom_spitter'], poison: { dps: 2.5, duration: 3 } },
    { damage: 2, cooldown: 1.0, range: 320, targets: 'ground', speed: POISON }),
  tower('venom_spitter', 'Venom Spitter', 'poison', 'poison', { tier: 2, price: 120, total: 200, next: ['venom_spire'], poison: { dps: 6, duration: 3 } },
    { damage: 4, cooldown: 1.0, range: 336, targets: 'ground', speed: POISON }),
  tower('venom_spire', 'Venom Spire', 'poison', 'poison', {
    tier: 3, price: 180, total: 380, next: ['plague_cauldron', 'widows_fang'], poison: { dps: 11, duration: 3 },
  }, { damage: 7, cooldown: 1.0, range: 352, targets: 'ground', speed: POISON }),
  tower('plague_cauldron', 'Plague Cauldron', 'poison', 'poison', {
    tier: 4, price: 270, total: 650, next: [], cloud: { radius: 112, duration: 3, dps: 16 },
  }, { damage: 0, cooldown: 2.0, range: 384, targets: 'ground', speed: 700 }),
  tower('widows_fang', 'Widow\'s Fang', 'poison', 'poison', {
    tier: 4, price: 270, total: 650, next: [], sticky: true, stacks: { dps: 8, duration: 4, max: 5 },
  }, { damage: 10, cooldown: 0.8, range: 352, targets: 'ground', speed: 1200 }),

  // Totem: auras for towers within 256. Only Storm Totem attacks.
  tower('drum_totem', 'Drum Totem', 'totem', null, { tier: 1, price: 90, total: 90, next: ['spirit_totem'], auras: { attackSpeed: 0.15, radius: 256 } }),
  tower('spirit_totem', 'Spirit Totem', 'totem', null, { tier: 2, price: 135, total: 225, next: ['ancestor_totem'], auras: { attackSpeed: 0.2, radius: 256 } }),
  tower('ancestor_totem', 'Ancestor Totem', 'totem', null, {
    tier: 3, price: 200, total: 425, next: ['war_totem', 'storm_totem'], auras: { attackSpeed: 0.25, range: 0.1, radius: 256 },
  }),
  tower('war_totem', 'War Totem', 'totem', null, {
    tier: 4, price: 300, total: 725, next: [], auras: { attackSpeed: 0.25, damage: 0.2, armor: 4, radius: 256 },
  }),
  tower('storm_totem', 'Storm Totem', 'totem', 'magic', {
    tier: 4, price: 300, total: 725, next: [], targeting: 'strong', auras: { attackSpeed: 0.25, range: 0.1, radius: 256 },
  }, { damage: 60, cooldown: 1.5, range: 320, targets: 'both', speed: 0 }),
];

export const ORIGINAL_TOWERS: Readonly<Record<string, OriginalTowerSpec>> = Object.fromEntries(ROWS);

/** Each family's Tier 1 tower, which is what a Build Spot builds. */
export const FAMILY_BASE: Readonly<Record<Family, string>> = {
  arrow: 'arrow_tower',
  cannon: 'cannon_tower',
  frost: 'frost_tower',
  arcane: 'mage_tower',
  poison: 'venom_dart',
  totem: 'drum_totem',
};

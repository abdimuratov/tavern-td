import type { AttackSpec, AuraSpec, EffectSpec, TargetLayer } from '../../sim';
import type { BaseSlate, GemInfo, GemTowerSpec } from './types';

// Slates (docs/research/gem-td-rules.md §7): support towers made from the Draft.
// They have no pathing (share/objects/standardize-slate-range.lua), so creeps
// walk over them and they never shape the maze or leave a Rock; here they still
// hold their 2 × 2 build cells. Most hit only what passes within 128. Slates are
// "ancient" structures, so they can't be swapped.

function melee(damage: readonly [number, number], cooldown: number, attackType: string, targets: TargetLayer, effects?: readonly EffectSpec[]): AttackSpec {
  return { damage, cooldown, range: 128, attackType, targets, projectileSpeed: 0, ...(effects ? { effects } : {}) };
}

/** A value for each Kill Step 1…11: the base and 10 increments. */
function steps(base: number, step: number): number[] {
  return Array.from({ length: 11 }, (_, i) => base + step * i);
}

function slate(name: string, family: string, attack: AttackSpec, extra: { auras?: readonly AuraSpec[]; gem?: Omit<GemInfo, 'kind' | 'family'> } = {}): GemTowerSpec {
  return {
    name,
    footprint: 2,
    walkable: true,
    attack,
    ...(extra.auras ? { auras: extra.auras } : {}),
    gem: { ...extra.gem, kind: 'slate', family },
  };
}

/** Opal Vein and Wraith share the buff "Boost": they don't stack with each other, but do with Opal. */
const BOOST = 'gem:boost';
/** Damage Slate and Viper Slate share one damage-aura buff. */
const SLATE_DAMAGE = 'gem:slate-damage';

export const GEM_SLATES: Readonly<Record<string, GemTowerSpec>> = {
  // Grab (src/gem/slate/hold.j): 1.5 s stun, 160 + 20 × kills chaos damage, taunt 600, disarmed 3.5 s.
  'hold-slate': slate('Hold Slate', 'hold', melee([0, 0], 0.05, 'chaos', 'ground', [
    { kind: 'gem.grab', stun: [1.5, 1.5], damage: 160, perKill: 20, attackType: 'chaos', disarm: 3.5, taunt: 600 },
  ])),
  // Attack 2 only: air (share/objects/air-slate.lua).
  'air-slate': slate('Air Slate', 'air', { damage: [40, 40], cooldown: 0.5, range: 850, attackType: 'pierce', targets: 'air', projectileSpeed: 1300 }),
  // src/gem/slate/ancient.j: a 3–7 s stun, 640 + 20 × kills normal damage, armor −(3 + 3n) ground / −(2 + n) air, taunt, disarmed 5 s.
  'ancient-slate': slate('Ancient Slate', 'ancient', melee([0, 0], 0.05, 'normal', 'both', [
    { kind: 'gem.grab', stun: [3, 7], damage: 640, perKill: 20, attackType: 'normal', disarm: 5, taunt: 600,
      armor: { family: 'ancient', ground: [3, 3], air: [2, 1] } },
  ])),
  'opal-vein-slate': slate('Opal Vein Slate', 'opal-vein', melee([80, 80], 0.5, 'magic', 'ground'), {
    auras: [{ kind: 'attackSpeed', to: 'towers', radius: 700, value: 0.1, key: BOOST }],
  }),
  // Trig_Slow_Slate_Actions: speed set to 85% of default, for good.
  'slow-slate': slate('Slow Slate', 'slow', melee([100, 100], 0.5, 'normal', 'ground', [{ kind: 'gem.permaSlow', factor: 0.85 }])),
  // Incinerate (A02V, share/objects/nerf-wraith.lua): +35 per stacked hit for 5 s; a creep dying under it explodes.
  'wraith-slate': slate('Wraith Slate', 'wraith', melee([200, 200], 0.3, 'hero', 'ground', [
    { kind: 'gem.incinerate', perStack: 35, duration: 5, explosion: { full: 500, fullRadius: 250, half: 250, halfRadius: 750, delay: 0.2 } },
  ]), { auras: [{ kind: 'attackSpeed', to: 'towers', radius: 1000, value: 0.1, key: BOOST }] }),
  // Shadow Strike (A05N, share/objects/slate/poison.lua): 5 of 5 mana, regen 4/s.
  // assumed: the decaying damage ticks every 2 s, as the tooltip says; AEsh's interval is engine-defined.
  'poison-slate': slate('Poison Slate', 'poison', melee([1, 1], 0.05, 'siege', 'both', [
    { kind: 'gem.shadowStrike', mana: 5, byKillStep: steps(20, 2), durationByKillStep: steps(20.1, 2), slow: 0.25, interval: 2 },
  ]), { gem: { mana: { max: 5, regen: 4 } } }),
  // Trig_Spell_Slate_Actions: 25% per landed hit, no mana.
  // assumed: Forked Lightning takes the nearest enemies within its 600 cast range, and Carrion Swarm's wave is 150 wide each side.
  'spell-slate': slate('Spell Slate', 'spell', melee([30, 40], 0.5, 'magic', 'both', [
    { kind: 'gem.spells', on: 'impact', chance: 0.25, mana: 0, spells: [
      { spell: 'fanOfKnives', damage: [80], radius: [500], maxTotal: 420 },
      { spell: 'forkedLightning', damage: [85], maxTargets: 9, range: 600 },
      { spell: 'carrionSwarm', damage: 125, maxTotal: 400, distance: 800, width: 150 },
    ] },
  ])),
  // Trig_Elder_Slate_Actions: 35% per attack with 5 mana (30 max, regen 4/s); spells grow with the Kill Step.
  'elder-slate': slate('Elder Slate', 'elder', melee([100, 100], 0.33, 'spells', 'both', [
    { kind: 'gem.spells', on: 'attack', chance: 0.35, mana: 5, spells: [
      { spell: 'fanOfKnives', damage: steps(150, 15), radius: steps(500, 25), maxTotal: 5000 },
      { spell: 'thunderClap', damage: steps(150, 15), radius: steps(350, 25), slow: 0.5, slowDuration: 5 },
      { spell: 'armor', amount: 7, duration: 25 },
      { spell: 'forkedLightning', damage: steps(200, 20), maxTargets: 9, range: 600 },
    ] },
  ]), { gem: { mana: { max: 30, regen: 4 } } }),
  // src/gem/slate/damage.j: 256 + 10 × kills normal damage per attack, then disarmed 1 s; +10% damage aura (A072).
  'damage-slate': slate('Damage Slate', 'damage', melee([1, 1], 0.05, 'normal', 'ground', [
    { kind: 'gem.strike', damage: 256, perKill: 10, attackType: 'normal', disarm: 1 },
  ]), { auras: [{ kind: 'damage', to: 'towers', radius: 250, value: 0.1, key: SLATE_DAMAGE }] }),
  // Barrage 15 on every enemy within 600 every 0.5 s (A073).
  'range-slate': slate('Range Slate', 'range', { damage: [15, 15], cooldown: 0.5, range: 600, attackType: 'hero', targets: 'both', projectileSpeed: 1500 }, {
    gem: { barrage: { damage: 15, targets: 0, radius: 600, cooldown: 0.5 } },
  }),
  // Barrage 30 within 750 (A074), burn 10 every 0.2 s within 400 (src/gem/slate/viper.j),
  // and a damage aura that grows with the Kill Step (share/objects/slate/viper.lua).
  'viper-slate': slate('Viper Slate', 'viper', { damage: [30, 30], cooldown: 0.5, range: 750, attackType: 'hero', targets: 'both', projectileSpeed: 1500 }, {
    gem: {
      barrage: { damage: 30, targets: 0, radius: 750, cooldown: 0.5 },
      burn: { dps: 50, radius: 400 },
      killAura: { kind: 'damage', radius: 400, byKillStep: steps(0.1, 0.03), key: SLATE_DAMAGE },
    },
  }),
};

/** The 8 base slates and how a Draft makes them (src/gem/slate/initialize.j). */
export const BASE_SLATES: readonly BaseSlate[] = [
  { id: 'hold-slate', normal: 'topaz-normal', flawed: ['amethyst-flawed', 'sapphire-flawed'], partner: 'air-slate', combo: 'ancient-slate' },
  { id: 'air-slate', normal: 'amethyst-normal', flawed: ['emerald-flawed', 'opal-flawed', 'ruby-flawed'], partner: 'hold-slate', combo: 'ancient-slate' },
  { id: 'opal-vein-slate', normal: 'opal-normal', flawed: ['ruby-flawed', 'topaz-flawed'], partner: 'slow-slate', combo: 'wraith-slate' },
  { id: 'slow-slate', normal: 'sapphire-normal', flawed: ['aquamarine-flawed', 'diamond-flawed', 'emerald-flawed'], partner: 'opal-vein-slate', combo: 'wraith-slate' },
  { id: 'poison-slate', normal: 'emerald-normal', flawed: ['aquamarine-flawed', 'opal-flawed', 'topaz-flawed'], partner: 'spell-slate', combo: 'elder-slate' },
  { id: 'spell-slate', normal: 'aquamarine-normal', flawed: ['amethyst-flawed', 'diamond-flawed'], partner: 'poison-slate', combo: 'elder-slate' },
  { id: 'damage-slate', normal: 'diamond-normal', flawed: ['opal-flawed', 'sapphire-flawed'], partner: 'range-slate', combo: 'viper-slate' },
  { id: 'range-slate', normal: 'ruby-normal', flawed: ['amethyst-flawed', 'ruby-flawed', 'topaz-flawed'], partner: 'damage-slate', combo: 'viper-slate' },
];

/** Combination slates and their two base slates, in the Recipe's order. */
export const COMBO_SLATES: Readonly<Record<string, readonly [string, string]>> = {
  'ancient-slate': ['hold-slate', 'air-slate'],
  'wraith-slate': ['opal-vein-slate', 'slow-slate'],
  'elder-slate': ['spell-slate', 'poison-slate'],
  'viper-slate': ['damage-slate', 'range-slate'],
};

/** A slate can't stand within this of the same slate, its combination or its parts (src/gem/slate/stacking.j)… */
export const SLATE_STACKING_RADIUS = 220;
/** …or it is pushed this far in a random direction until clear. */
export const SLATE_PUSH = 400;

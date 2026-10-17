import type { ArmorType, DamageType, Family, PerkSpec } from './types';

// The Original's economy, pacing, Tower Levels, Perks, Stars and unlocks
// (docs/original-design.md §4, §7–10). The curves themselves live in
// src/sim/modes/original/waves.ts; these are their numbers.

export const START_LIVES = 20;

/** Seconds of Break before the next Wave. It starts at the current Wave's last spawn, so Waves overlap. */
export const BREAK_SECONDS = 30;

/** Ghoul HP at Threat T: 20 × 1.10^(T−1). */
export const GHOUL_HP = { base: 20, growth: 1.1 } as const;

/** A Wave's bounty pool: 10 × (1 + ⌊T/4⌋), split by each creep's share of the Wave's HP. */
export const BOUNTY_POOL = { base: 10, every: 4 } as const;

/** The end-of-Wave bonus, 20 + 4T, paid once every creep of the Wave is dead or leaked. */
export const WAVE_BONUS = { base: 20, perThreat: 4 } as const;

/** Early call: ⌊0.4 × seconds left × (1 + T/10)⌋, with T of the Wave called. */
export const EARLY_CALL = { perSecond: 0.4, perThreat: 0.1 } as const;

/** Selling refunds this share of the total spent; whatever was spent since the current Break began comes back in full. */
export const SELL_SHARE = 0.7;

/** Damage type × armor type (§4): armor cuts physical hits, wards cut magic, and nothing is immune. */
export const DAMAGE_TABLE: Readonly<Record<DamageType, Readonly<Record<ArmorType, number>>>> = {
  pierce: { unarmored: 1, armored: 0.5, warded: 1, boss: 0.7 },
  siege: { unarmored: 1, armored: 0.75, warded: 1, boss: 0.85 },
  magic: { unarmored: 1, armored: 1, warded: 0.5, boss: 0.7 },
  poison: { unarmored: 1, armored: 1, warded: 1, boss: 1 },
};

/** Bosses take slows at this share of their strength, and ignore stuns and freezes. */
export const BOSS_SLOW_SHARE = 0.5;

// --- Tower Levels (§7) ----------------------------------------------------------

/** Total XP for Tower Levels 1–10. */
export const LEVEL_XP: readonly number[] = [0, 8, 20, 36, 56, 80, 108, 140, 176, 216];
export const MAX_LEVEL = 10;
/** Damage each Level above 1 adds. */
export const LEVEL_DAMAGE = 0.03;
/** What each Level above 1 adds to a Totem's percentage auras instead (one point). */
export const LEVEL_AURA = 0.01;
/** Every other tower that hit or slowed the creep this recently gets an Assist. */
export const ASSIST_SECONDS = 3;
/** An Assist is this share of the kill's XP. */
export const ASSIST_SHARE = 0.5;
/** A Totem gets this share of the XP of every kill made by a tower in its aura. */
export const TOTEM_SHARE = 0.5;
/** The Tower Levels that bring a Perk. */
export const PERK_LEVELS = [5, 10] as const;

/** Each family's Perks: the same two on every Tier and Specialisation. */
export const PERKS: Readonly<Record<Family, readonly [level5: PerkSpec, level10: PerkSpec]>> = {
  arrow: [
    { name: 'Keen Eye', text: '+15% range', effect: { kind: 'range', value: 0.15 } },
    { name: 'Heartseeker', text: 'Every 4th arrow crits ×2.5', effect: { kind: 'everyNth', every: 4, multiplier: 2.5 } },
  ],
  cannon: [
    { name: 'Wide Blast', text: '+25% splash radius', effect: { kind: 'splashRadius', value: 0.25 } },
    { name: 'Double Charge', text: 'Every 3rd shot fires a second shell at another creep', effect: { kind: 'secondShot', every: 3 } },
  ],
  frost: [
    { name: 'Frost Nova', text: 'Every 10 s, slows every creep in range 60% for 1.5 s', effect: { kind: 'nova', every: 10, slow: 0.6, duration: 1.5 } },
    { name: 'Deep Freeze', text: '10% of hits freeze for 1 s', effect: { kind: 'freeze', chance: 0.1, duration: 1 } },
  ],
  arcane: [
    { name: 'Surge', text: 'Every 5th attack deals double', effect: { kind: 'everyNth', every: 5, multiplier: 2 } },
    // assumed: the jump reaches the nearest other creep within 192 of the one hit.
    { name: 'Arc', text: 'Every hit jumps to one more creep for 50%', effect: { kind: 'arc', share: 0.5, radius: 192 } },
  ],
  poison: [
    { name: 'Spores', text: 'Each hit also poisons the nearest other creep within 128', effect: { kind: 'spores', radius: 128 } },
    { name: 'Virulence', text: '+40% poison damage', effect: { kind: 'poisonDamage', value: 0.4 } },
  ],
  totem: [
    { name: 'Wider Circle', text: '+20% aura radius', effect: { kind: 'auraRadius', value: 0.2 } },
    {
      name: 'War Drums', text: 'Every 15 s, towers in its aura get +50% attack speed for 4 s',
      effect: { kind: 'drums', every: 15, value: 0.5, duration: 4 },
    },
  ],
};

// --- Stars and unlocks (§8, §9) -------------------------------------------------

/** Stars for a won Stage by lives left: the first row whose `lives` it reaches. */
export const STAR_LIVES: readonly { readonly lives: number; readonly stars: number }[] = [
  { lives: 18, stars: 3 },
  { lives: 6, stars: 2 },
  { lives: 1, stars: 1 },
];

/** What finishing each Stage unlocks; `after: 0` is the start of the Campaign. */
export interface UnlockStep {
  readonly after: number;
  readonly families?: readonly Family[];
  readonly tier3?: boolean;
  readonly specialisations?: boolean;
  readonly talents?: boolean;
}

export const UNLOCKS: readonly UnlockStep[] = [
  { after: 0, families: ['arrow', 'cannon'] },
  { after: 1, families: ['frost'], talents: true },
  { after: 2, tier3: true },
  { after: 3, families: ['arcane'] },
  { after: 4, families: ['poison'] },
  { after: 5, specialisations: true },
  { after: 6, families: ['totem'] },
];

import type { ArmorType, AttackType } from './types';

// Maul's economy and pacing (docs/maul-design.md §7–8), from the baseline in
// td-design-and-balance.md §9. The curves live in src/sim/modes/maul/waves.ts;
// these are their numbers.

/** Wintermaul's start bought six cheap openers; this buys a few Tier 1 towers and the first Walls. */
export const START_GOLD = 300;
export const START_LIVES = 20;

/**
 * A Brawler's HP on Wave w: 8 × 1.12^(w−1), before Difficulty. Twenty of them
 * (ten a gate) are about §9's normal Wave early. The curve climbs faster than
 * §9's 1.10 because a maze multiplies every tower's time on target as it grows.
 */
export const RAIDER_HP = { base: 8, growth: 1.12 } as const;

/**
 * A Wave's bounty pool: 20 × (1 + ⌊w/4⌋), split by each creep's share of the
 * Wave's HP. Twice §9's, because Walls are gold that adds no damage: about a
 * gold a creep early and four late, as Wintermaul paid.
 */
export const BOUNTY_POOL = { base: 20, every: 4 } as const;

/** The end-of-Wave bonus, 20 + 4w, paid once every creep of the Wave is dead or leaked. */
export const WAVE_BONUS = { base: 20, perWave: 4 } as const;

/** Interest on unspent gold, paid with each end-of-Wave bonus and capped at that bonus. */
export const INTEREST_RATE = 0.04;

/** Selling refunds this share of the gold a tower cost, as Wintermaul's 75%; gold spent during the current Break comes back in full. */
export const SELL_SHARE = 0.75;

/** Seconds of Break before Wave 1, and after each Wave is cleared (Wintermaul's 60 and 30). Waves never overlap. */
export const FIRST_BREAK_SECONDS = 60;
export const BREAK_SECONDS = 30;

/** A second Race can join the Run once this Wave is cleared, as Wintermaul's second lumber did. */
export const SECOND_RACE_AFTER = 15;

/** Every Nth Wave is a boss Wave. */
export const BOSS_EVERY = 10;

/** Attack type × armor type. Each attack has a favourite, and chaos and poison treat every armor alike. */
export const MAUL_DAMAGE_TABLE: Readonly<Record<AttackType, Readonly<Record<ArmorType, number>>>> = {
  pierce: { light: 1.5, medium: 1, heavy: 0.75, fortified: 0.5, hero: 1 },
  siege: { light: 0.5, medium: 1, heavy: 1, fortified: 1.5, hero: 1 },
  frost: { light: 1, medium: 1.5, heavy: 0.75, fortified: 0.75, hero: 1 },
  magic: { light: 1, medium: 1, heavy: 1.5, fortified: 0.5, hero: 1 },
  chaos: { light: 1, medium: 1, heavy: 1, fortified: 1, hero: 1 },
};

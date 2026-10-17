// Gem Quality (R000, researched at the Mine) and Extra Chance
// (docs/research/gem-td-rules.md §8; src/gem/chance.j, src/gem/extra-chance.j).

/** Highest Gem Quality. */
export const MAX_QUALITY = 8;

/** Gold to reach Gem Quality n is QUALITY_COST[n − 1] = 20 + 30 × (n − 1); 1,000 in all (war3map.w3q: R000 gglb 20, gglm 30). */
export const QUALITY_COST: readonly number[] = [20, 50, 80, 110, 140, 170, 200, 230];

/**
 * Quality weights for each Gem Quality, Chipped to Great. Each of the 8 types gets these
 * weights, so a Draft gem is one weighted draw over 48 gems totalling 800, and
 * the type is uniform. Great never rolls.
 */
export const QUALITY_WEIGHTS: readonly (readonly [number, number, number, number, number, number])[] = [
  [100, 0, 0, 0, 0, 0],
  [70, 30, 0, 0, 0, 0],
  [60, 30, 10, 0, 0, 0],
  [50, 30, 20, 0, 0, 0],
  [40, 30, 20, 10, 0, 0],
  [30, 30, 30, 10, 0, 0],
  [20, 30, 30, 20, 0, 0],
  [10, 30, 30, 30, 0, 0],
  [0, 30, 30, 30, 10, 0],
];

/** Extra Chance unlocks at this Gem Quality. */
export const EXTRA_CHANCE_QUALITY = 8;

export const EXTRA_CHANCE = {
  /** Gold for a gem-type target (the menu shows it as "Perfect X"). */
  typeCost: 175,
  /** Gold for a base-slate target. */
  slateCost: 125,
  rolls: 5,
  totalWeight: 80,
  maxBonus: 10,
  /** At this bonus every roll hits. */
  thresholdBonus: 5,
  /** Type rolls: a hit needs roll ≤ (25 + 11 × bonus) / 80; roll ≤ 2^(bonus − 10) is a lucky hit. */
  typeInitial: 25,
  typeBias: 2,
  /** Slate rolls: (18.75 + 12.25 × bonus) / 80; any roll ≤ 2.5^(bonus − 10) makes every roll hit. */
  slateInitial: 18.75,
  slateBias: 2.5,
  /** Chance a Normal piece is the target slate's (else its partner's), by its number of Flawed options. */
  slateTwo: 0.67,
  slateThree: 0.75,
  /** Quality of a type hit, Chipped to Perfect (they sum to 1). */
  typeQuality: [0.096, 0.238, 0.238, 0.238, 0.19],
} as const;

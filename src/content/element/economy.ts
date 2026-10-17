import type { Difficulty } from '../../sim';
import type { DamageElement, Element } from './types';

// Element TD's economy, Lumber, Elements and score (docs/research/element-td-rules.md
// §2, §4, §7–10), from gamesettings.kv, interest.lua, sell.lua, summoner.lua,
// random.lua and scoring.lua via element-data.json.

export type RunLength = 'full' | 'express';
export type Picks = 'allPick' | 'allRandom';

export const START: Readonly<Record<RunLength, { readonly gold: number; readonly lumber: number; readonly pregame: number }>> = {
  full: { gold: 250, lumber: 1, pregame: 30 },
  express: { gold: 600, lumber: 2, pregame: 45 },
};
export const START_LIVES = 50;

/** Interest: ⌊2% of gold⌋ every 15 s from Wave 1's first spawn, uncapped. */
export const INTEREST_RATE = 0.02;
export const INTEREST_PERIOD = 15;
/** Interest stops for good once this many Waves are cleared (WAVE_COUNT − END_OFFSET). */
export const INTEREST_STOPS_AFTER: Readonly<Record<RunLength, number>> = { full: 55, express: 29 };

/** A Lumber arrives at the start of the break after each of these Waves. */
export const LUMBER_AFTER: Readonly<Record<RunLength, readonly number[]>> = {
  full: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  express: [3, 6, 9, 12, 15, 18, 21, 24, 27],
};
/** A free Pure Essence arrives at the start of the break after each of these Waves. */
export const ESSENCE_AFTER: Readonly<Record<RunLength, readonly number[]>> = { full: [50, 55], express: [24, 27] };

export const MAX_ELEMENT_LEVEL = 3;
/** All Pick in Full gives one free Element: the first summon of an Element below level 2 needs no Elemental. */
export const FREE_ELEMENTS = 1;
/** Express: summons are instant, but level 2 needs this many cleared Waves and level 3 that many. */
export const EXPRESS_LEVEL_GATES: Readonly<Record<number, number>> = { 2: 6, 3: 15 };
/** Pure Essence bought with Lumber, at most this many. */
export const MAX_ESSENCE_BOUGHT = 2;

/** Lives a leak costs (wavedata.lua ReduceLivesForPlayer, summoner.lua). */
export const LEAK_LIVES = { creep: 1, bulky: 2, boss: 3, elemental: 3 } as const;

/** Sell refund shares (sell.lua): 90% normally, 98% for the Arrow and Cannon lines, 100% for every tower in All Random. */
export const SELL = { normal: 0.9, arrowCannon: 0.98, random: 1 } as const;

/** Damage multipliers, attacker row × creep column (constants.lua DamageModifiers); missing pairs are 100%. */
export const DAMAGE_TABLE: Readonly<Record<DamageElement, Readonly<Partial<Record<DamageElement, number>>>>> = {
  water: { fire: 2, dark: 0.5, composite: 0.9 },
  fire: { nature: 2, water: 0.5, composite: 0.9 },
  nature: { earth: 2, fire: 0.5, composite: 0.9 },
  earth: { light: 2, nature: 0.5, composite: 0.9 },
  light: { dark: 2, earth: 0.5, composite: 0.9 },
  dark: { water: 2, light: 0.5, composite: 0.9 },
  composite: {},
};

export function damageMultiplier(attack: DamageElement, armor: DamageElement): number {
  return DAMAGE_TABLE[attack][armor] ?? 1;
}

/** The All Random draw pool (random.lua): the six Elements plus "pure". */
export type Draw = Element | 'pure';
export const DRAW_POOL: readonly Draw[] = ['water', 'fire', 'earth', 'nature', 'dark', 'light', 'pure'];
/** Draw limits (random.lua getRandomElement): no level 2 before `level2`, no level 3 before `level3`, no new Element from `noNew`. */
export const DRAW_LIMITS: Readonly<Record<RunLength, { readonly level2: number; readonly level3: number; readonly noNew: number | null }>> = {
  full: { level2: 10, level3: 30, noNew: 45 },
  express: { level2: 3, level3: 12, noNew: null },
};

/** Score bonus D per Difficulty (scoring.lua GetDifficultyBonus); Easy scores as Normal (assumed). */
export const SCORE_BONUS: Readonly<Record<Difficulty, number>> = { easy: 0, normal: 0, hard: 1, insane: 3.5 };
export const SCORE = {
  /** Wave w cleared: (w + offset) × perWave × (1.3 with no leaks) × (1 + D). */
  waveOffset: { full: 10, express: 20 } as Readonly<Record<RunLength, number>>,
  perWave: 30,
  cleanBonus: 0.3,
  /** Clearing the last Wave: (score + net worth) × (1 + speed); speed = (par / t − 1) × factor. */
  par: { full: 2400, express: 1200 } as Readonly<Record<RunLength, number>>,
  speedFactor: { full: 1.55, express: 1 } as Readonly<Record<RunLength, number>>,
  /** Boss Wave n cleared: creeps × perBoss × (1 + 0.2 (n − 1)) × (1 + D); kills of an unfinished one count the same. */
  perBoss: 400,
  bossGrowth: 0.2,
} as const;

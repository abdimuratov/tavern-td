import type { CreepSpec, WaveSpec } from '../../sim';
import type { ArmorType } from './damage';

// Gem TD+'s 50 Waves (docs/research/gem-td-rules.md §10). Every Wave is 10
// creeps of one kind, spawned 1.61 s apart from the start; air on every 4th
// Wave; the Damage Test boss comes with Wave 50, 16.1 s in. No creep has an
// ability, regeneration or evasion. Armor and HP are after
// share/objects/difficulty-armor-changes.lua (×1.2 HP on air Waves and Waves
// 40–49; Wave 50 set to 85,000). Bounty is ubba + 1d1, so a fixed value. The
// minimum speed is the larger of the creep's own and Gem TD+'s 220. Names are ours.

export interface GemCreepSpec extends CreepSpec {
  readonly armorType: ArmorType;
  readonly minSpeed: number;
  /** A WC3 hero: Frost Attack lasts 3 s instead of 5. */
  readonly hero?: boolean;
}

export const WAVE_COUNT = 50;
export const WAVE_SIZE = 10;
export const SPAWN_INTERVAL = 1.61;
/** The Damage Test spawns 10 × 1.61 s after the first creep of Wave 50. */
export const BOSS_DELAY = 16.1;
export const BOSS = 'boss';

const NAMES = [
  'Cellar Rat', 'Cave Newt', 'Burrow Mole', 'Dusk Bat', 'Pebble Golem',
  'Boulder Golem', 'Bog Toad', 'Magpie Thief', 'Cutpurse', 'Sellsword',
  'Mire Slug', 'Moss Drake', 'Tunnel Spider', 'Hill Troll', 'Ember Imp',
  'Marsh Heron', 'Marauder', 'Boar Rider', 'Tide Spirit', 'Hunting Hawk',
  'Fen Lord', 'Ore Wagon', 'Restless Miner', 'Grave Raven', 'Plague Carrier',
  'Stone Beetle', 'Shadow Cat', 'Night Owl', 'Iron Tortoise', 'Troll Chieftain',
  'Ember Fox', 'Coal Wyrm', 'Storm Shaman', 'Siren', 'Ranger Captain',
  'Fire Wyrm', 'Minotaur', 'Minotaur Chief', 'Escaped Convict', 'Storm Kite',
  'Bulwark', 'Crystal Golem', 'Crimson Crane', 'Marsh Light', 'Dire Bear',
  'Gladiator', 'Giant Crab', 'Sunbird', 'Rockroller', 'Crystal Behemoth',
] as const;

/** [Wave, HP, armor, armor type, speed, minimum speed, air, bounty]. */
type Row = readonly [number, number, number, ArmorType, number, number, boolean, number];

const ROWS: readonly Row[] = [
  [1, 10, 12, 'normal', 265, 220, false, 1],
  [2, 30, 12, 'medium', 265, 220, false, 1],
  [3, 55, 12, 'large', 265, 220, false, 1],
  [4, 84, 12, 'none', 230, 220, true, 2],
  [5, 90, 12, 'fort', 275, 220, false, 2],
  [6, 120, 12, 'fort', 275, 220, false, 2],
  [7, 178, 12, 'none', 285, 220, false, 2],
  [8, 288, 12, 'none', 230, 220, true, 3],
  [9, 300, 12, 'large', 285, 220, false, 3],
  [10, 470, 15, 'hero', 285, 220, false, 3],
  [11, 490, 15, 'fort', 285, 220, false, 3],
  [12, 540, 13, 'none', 250, 220, true, 4],
  [13, 570, 15, 'normal', 295, 220, false, 4],
  [14, 650, 15, 'medium', 295, 220, false, 4],
  [15, 1000, 15, 'small', 295, 220, false, 4],
  [16, 870, 13, 'none', 250, 220, true, 5],
  [17, 1450, 15, 'small', 325, 265, false, 5],
  [18, 1850, 15, 'none', 325, 290, false, 5],
  [19, 2350, 15, 'hero', 350, 310, false, 5],
  [20, 1620, 13, 'none', 280, 220, true, 6],
  [21, 3150, 19, 'large', 400, 315, false, 6],
  [22, 3500, 19, 'fort', 420, 320, false, 6],
  [23, 4300, 19, 'small', 440, 325, false, 6],
  [24, 3000, 13, 'none', 280, 220, true, 7],
  [25, 5250, 19, 'small', 435, 330, false, 7],
  [26, 6300, 19, 'fort', 440, 335, false, 7],
  [27, 7900, 19, 'hero', 445, 340, false, 7],
  [28, 4980, 14, 'none', 275, 220, true, 8],
  [29, 9000, 19, 'large', 450, 345, false, 8],
  [30, 11000, 23, 'fort', 455, 350, false, 8],
  [31, 12750, 23, 'medium', 460, 355, false, 8],
  [32, 7440, 14, 'none', 320, 220, true, 9],
  [33, 14500, 23, 'small', 465, 360, false, 9],
  [34, 16500, 23, 'normal', 470, 365, false, 9],
  [35, 19000, 23, 'hero', 475, 380, false, 9],
  [36, 10200, 14, 'none', 320, 220, true, 10],
  [37, 21000, 23, 'normal', 480, 390, false, 10],
  [38, 23000, 23, 'small', 485, 395, false, 10],
  [39, 25000, 23, 'large', 490, 390, false, 10],
  [40, 12600, 14, 'none', 330, 220, true, 11],
  [41, 34800, 30, 'fort', 522, 410, false, 11],
  [42, 40200, 34, 'divine', 522, 410, false, 16],
  [43, 45000, 35, 'none', 522, 420, false, 16],
  [44, 15600, 14, 'none', 370, 220, true, 16],
  [45, 48000, 35, 'hero', 522, 420, false, 18],
  [46, 52800, 35, 'medium', 522, 430, false, 18],
  [47, 56400, 35, 'large', 522, 440, false, 18],
  [48, 18000, 15, 'none', 380, 220, true, 20],
  [49, 60000, 35, 'small', 522, 445, false, 20],
  [50, 85000, 35, 'divine', 522, 445, false, 20],
];

export function waveCreepId(wave: number): string {
  return `wave-${wave}`;
}

export const GEM_CREEPS: Readonly<Record<string, GemCreepSpec>> = Object.fromEntries([
  ...ROWS.map(([wave, hp, armor, armorType, speed, minSpeed, flying, bounty]) => [
    waveCreepId(wave),
    { name: NAMES[wave - 1]!, hp, armor, armorType, speed, minSpeed, flying, bounty },
  ] as const),
  // H04B: a level-50 hero, 500,000 HP, divine armor 40. assumed: hero agility
  // armor nets to 0 at level 50 (AgiDefenseBase −2 + 50 × 0.04), so 40 total.
  [BOSS, { name: 'Proving Anvil', hp: 500_000, armor: 40, armorType: 'divine', speed: 522, minSpeed: 320, flying: false, bounty: 1000, hero: true }],
]);

export const GEM_WAVES: readonly WaveSpec[] = ROWS.map(([wave]) => ({
  groups: [
    { creep: waveCreepId(wave), count: WAVE_SIZE, interval: SPAWN_INTERVAL },
    ...(wave === WAVE_COUNT ? [{ creep: BOSS, count: 1, interval: 0, delay: BOSS_DELAY }] : []),
  ],
}));

/** Leaks cost nothing but the bounty before this Wave; from it on, any leak ends the Run. */
export const FATAL_LEAK_WAVE = 10;

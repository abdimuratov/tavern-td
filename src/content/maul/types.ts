import type { CreepSpec, TowerSpec } from '../../sim';

// Shapes of Maul's content (docs/maul-design.md). Tower and creep specs are
// core specs plus a `maul` block the Maul Game Mode reads. Attacks go through
// the core's damage table and effects; Maul adds two effect kinds of its own
// (src/sim/modes/maul/effects.ts). Numbers marked "assumed" fill gaps the
// design doc leaves open.

/** The four builders a Run can pick, each with its own towers. */
export const RACES = ['ironclad', 'rimeborn', 'mirefolk', 'runecasters'] as const;
export type RaceId = (typeof RACES)[number];

/** What kind of hit a tower deals; poison over time skips the table and armor altogether. */
export const ATTACK_TYPES = ['pierce', 'siege', 'frost', 'magic', 'chaos'] as const;
export type AttackType = (typeof ATTACK_TYPES)[number];

export const ARMOR_TYPES = ['light', 'medium', 'heavy', 'fortified', 'hero'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

/** Where a tower sits in its Race's tree: the Wall, or line A or B at Tier 1–3. */
export type TowerLine = 'wall' | 'a' | 'b';

export interface MaulTowerInfo {
  readonly race: RaceId;
  readonly line: TowerLine;
  /** 0 for the Wall, 1–3 up a line; Tier 3 is one of two forks. */
  readonly tier: 0 | 1 | 2 | 3;
  /** Gold this step costs from the step below; a Wall or Tier 1 built from nothing costs its `total`. */
  readonly price: number;
  /** Gold for this tower and every step below it. */
  readonly total: number;
  /** What it can become: a Wall either line's Tier 1, a Tier 1 its Tier 2, a Tier 2 its two forks. */
  readonly next: readonly string[];
  /** One line on what it is for, for the build menu and the panel. */
  readonly role: string;
}

export interface MaulTowerSpec extends TowerSpec {
  readonly cost: number;
  readonly maul: MaulTowerInfo;
}

export interface RaceSpec {
  readonly id: RaceId;
  readonly name: string;
  /** One line for New Run. */
  readonly about: string;
  /** Its Wall, then line A's and line B's Tier 1: what the build menu offers. */
  readonly builds: readonly [wall: string, a: string, b: string];
}

/** What a creep is for in a Wave, and so how a Wave of it is made up. */
export type CreepKind = 'normal' | 'swarm' | 'fast' | 'brute' | 'golem' | 'regen' | 'unslowable' | 'air' | 'boss';

export interface MaulCreepInfo {
  readonly kind: CreepKind;
  /** Its share of a Wave's HP budget per creep, as a multiple of a normal creep's. */
  readonly hpMult: number;
  /** Creeps of it in a Wave, per spawn. */
  readonly perSpawn: number;
  /** Seconds between two of them leaving one spawn. */
  readonly gap: number;
  /** Lives its leak costs. */
  readonly lives: number;
  /** Numeric armor on top of the Wave's. */
  readonly armor: number;
  /** Slows can't touch it. */
  readonly unslowable?: boolean;
  /** One line on how to beat it, for the wave preview. */
  readonly hint: string;
}

export interface MaulCreepSpec extends CreepSpec {
  readonly armorType: ArmorType;
  readonly maul: MaulCreepInfo;
}

/** One Wave: a creep kind from each spawn, and on boss Waves an escort behind the boss. */
export interface MaulWave {
  readonly creep: string;
  /** Which spawns send it; both by default. */
  readonly spawns?: 'both' | 'west' | 'east';
  readonly escort?: { readonly creep: string; readonly count: number };
}

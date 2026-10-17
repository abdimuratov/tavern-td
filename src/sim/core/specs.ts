import type { Cell } from './types';

// Content data: Game Modes describe their Maps, towers, creeps and Waves with these.
// Entities in the GameState only carry a spec id and look the rest up here.

export type TargetLayer = 'ground' | 'air' | 'both';

export interface MapSpec {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
  /** One string per row: `.` buildable, `,` walkable but unbuildable, `#` neither. */
  readonly terrain: readonly string[];
  readonly spawn: Cell;
  /** Regions creeps must enter in order: the checkpoints, then the exit last. */
  readonly waypoints: readonly (readonly Cell[])[];
}

export interface CreepSpec {
  readonly name: string;
  readonly hp: number;
  readonly armor: number;
  readonly armorType: string;
  /** World units per second. */
  readonly speed: number;
  readonly flying: boolean;
  readonly bounty: number;
  /** Lives lost when it leaks, 1 by default. A Game Mode's onLeak can decide otherwise. */
  readonly leakCost?: number;
  /** HP regained per second. */
  readonly regen?: number;
  /** World units per second that slows can't push it below (WC3's minimum move speed), or its base speed if lower; a stun still stops it. */
  readonly minSpeed?: number;
}

export interface AttackSpec {
  /** Rolled uniformly per shot; whole numbers roll whole numbers, as in WC3. */
  readonly damage: readonly [min: number, max: number];
  /** Seconds between attacks, divided by (1 + attack-speed bonus). */
  readonly cooldown: number;
  /** World units, centre to centre. */
  readonly range: number;
  readonly attackType: string;
  readonly targets: TargetLayer;
  /** World units per second; 0 hits instantly. */
  readonly projectileSpeed: number;
  readonly effects?: readonly EffectSpec[];
  /**
   * WC3 dice: `count` dice of 1…`sides` on top of a base of `damage[0] − count`, so
   * the roll clusters in the middle. Absent: one uniform roll over `damage`.
   */
  readonly dice?: readonly [count: number, sides: number];
}

export interface TowerSpec {
  readonly name: string;
  readonly cost?: number;
  /** Absent for structures that only shape the maze, such as Rocks. */
  readonly attack?: AttackSpec;
  readonly auras?: readonly AuraSpec[];
  /** Side of the square of cells it covers, anchored at its top-left cell; 1 by default. */
  readonly footprint?: number;
  /** Creeps walk over it (Gem's slates): it takes build space but never shapes the maze. */
  readonly walkable?: boolean;
}

/** WC3 splash: each creep takes the factor of the smallest band it stands in (full, medium, small). */
export interface SplashEffect {
  readonly kind: 'splash';
  readonly bands: readonly (readonly [radius: number, factor: number])[];
  /** Which creeps the splash can hit; the attack's own targets by default (WC3 artillery often splashes ground only). */
  readonly targets?: TargetLayer;
}

/** Move-speed fraction removed. Slows with the same key don't stack: the strongest applies. */
export interface SlowEffect {
  readonly kind: 'slow';
  readonly amount: number;
  readonly duration: number;
  readonly chance?: number;
  readonly key?: string;
}

/** Damage per second that ignores armor and the damage table. */
export interface PoisonEffect {
  readonly kind: 'poison';
  readonly dps: number;
  readonly duration: number;
  readonly chance?: number;
  readonly key?: string;
}

export interface ArmorEffect {
  readonly kind: 'armor';
  /** Armor removed while it lasts. */
  readonly amount: number;
  readonly duration: number;
  readonly chance?: number;
  readonly key?: string;
}

export interface StunEffect {
  readonly kind: 'stun';
  readonly chance: number;
  readonly duration: number;
  readonly key?: string;
}

export interface CritEffect {
  readonly kind: 'crit';
  readonly chance: number;
  readonly multiplier: number;
}

/** Hits up to `count` creeps per attack: the target plus the closest others in range. */
export interface MultishotEffect {
  readonly kind: 'multishot';
  readonly count: number;
}

/** A kind a Game Mode registered with registerEffect. */
export interface CustomEffect {
  readonly kind: string;
  readonly [key: string]: unknown;
}

export type EffectSpec =
  | SplashEffect
  | SlowEffect
  | PoisonEffect
  | ArmorEffect
  | StunEffect
  | CritEffect
  | MultishotEffect
  | CustomEffect;

/**
 * Applies a status of `kind` with `value` to everything of the given sort within `radius`,
 * refreshed every tick. Built-in kinds: `attackSpeed`, `damage` and `range` on towers;
 * `armor`, `slow` and `poison` on creeps. The same key from two towers doesn't stack.
 */
export interface AuraSpec {
  readonly kind: string;
  readonly to: 'towers' | 'creeps';
  readonly radius: number;
  readonly value: number;
  /** Which creeps a creep aura touches; both by default. */
  readonly targets?: TargetLayer;
  readonly key?: string;
}

export interface WaveGroup {
  readonly creep: string;
  readonly count: number;
  /** Seconds between spawns; 0 sends the whole group at once. */
  readonly interval: number;
  /** Seconds after the Wave starts. */
  readonly delay?: number;
  /** Replaces the creep spec's HP for this group. */
  readonly hp?: number;
}

export interface WaveSpec {
  readonly groups: readonly WaveGroup[];
  /** Replaces the creep specs' HP for the whole Wave (a group's own hp wins). */
  readonly hp?: number;
  readonly hpMult?: number;
  readonly speedMult?: number;
  readonly bountyMult?: number;
}

/** Attack type × armor type multipliers; a missing pair counts as 1. */
export type DamageTable = Readonly<Record<string, Readonly<Record<string, number>>>>;

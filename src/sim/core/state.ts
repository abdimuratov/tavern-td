import type { RngState } from './rng';
import type { MapSpec } from './specs';

// The whole Run is one JSON-serializable object (ADR-0002): no classes, Maps,
// undefined, Infinity or NaN. Every entity is created with all its fields, so
// a JSON-restored state serializes byte for byte like the original.

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'insane'];

export type Phase = 'build' | 'wave' | 'won' | 'lost';

/**
 * A timed effect on a creep or tower. Statuses with the same key don't stack:
 * only the one with the highest value counts.
 */
export interface Status {
  /** The effect handler that gives it meaning. */
  kind: string;
  key: string;
  value: number;
  /** Ticks left. */
  ticks: number;
  /** Tower that applied it, credited with poison kills; 0 for none. */
  src: number;
}

export interface Creep {
  id: number;
  spec: string;
  /** Wave number it belongs to; 0 for creeps a Game Mode spawned outside a Wave. */
  wave: number;
  x: number;
  y: number;
  /** 0 or less once it is dead or has left the Map; it is dropped at the end of the tick. */
  hp: number;
  maxHp: number;
  /** Base move speed in world units per tick, Wave multipliers included. */
  speed: number;
  bounty: number;
  /** Copied from the spec because targeting checks it constantly. */
  air: boolean;
  /** Index of the waypoint region it is heading for. */
  seg: number;
  status: Status[];
  /** Distance walked along the Map's route; only on Maps that have one, so other Runs serialize as before. */
  dist?: number;
  /** Index of the route it walks (or whose air line it flies); only on Maps with a `routes` list. */
  route?: number;
  /** Index of the spawn it entered at; only on Maps with a `spawns` list. */
  spawn?: number;
}

export interface Tower {
  id: number;
  spec: string;
  /** Anchor cell: the top-left of its footprint. */
  cell: number;
  /** Every cell its footprint covers, the anchor first, row by row. */
  cells: number[];
  /** Footprint centre. */
  x: number;
  y: number;
  /** Ticks until it may attack. Fractional, so cooldowns that aren't whole ticks average out. */
  cd: number;
  /** Creep it is attacking, 0 for none. */
  target: number;
  kills: number;
  status: Status[];
}

export interface Projectile {
  id: number;
  tower: number;
  /** Tower spec at launch, since the tower may be gone when it lands. */
  spec: string;
  /** Creep it homes on, 0 once that creep is gone. */
  target: number;
  x: number;
  y: number;
  /** Last known target position. */
  tx: number;
  ty: number;
  /** World units per tick. */
  speed: number;
  /** Before the damage table and armor. */
  damage: number;
  /** Crit multiplier rolled at launch, 1 for none. */
  crit: number;
}

/** A Wave group resolved at Wave start, so later content or state changes can't alter it. */
export interface SpawnGroup {
  creep: string;
  count: number;
  spawned: number;
  /** Tick of the first spawn (fractional). Spawn k is due at round(start + k·interval). */
  start: number;
  /** Ticks between spawns (fractional). */
  interval: number;
  hp: number;
  /** World units per second, Wave multiplier included. */
  speed: number;
  bounty: number;
  /** The route its creeps take; only when the Wave group names one. */
  route?: number;
  /** The spawn its creeps enter at; only when the Wave group names one. */
  spawn?: number;
}

export interface ActiveWave {
  number: number;
  groups: SpawnGroup[];
}

export interface WaveState {
  /** The latest Wave started, 1-based; 0 before the first. */
  number: number;
  total: number;
  active: ActiveWave[];
}

export interface GameState<M = unknown> {
  v: number;
  modeId: string;
  seed: number;
  difficulty: Difficulty;
  tick: number;
  phase: Phase;
  rng: RngState;
  /** Shared by creeps, towers and projectiles, so ids only grow and lists stay sorted by id. */
  nextId: number;
  gold: number;
  lives: number;
  map: MapSpec;
  /** Structure id on each cell (row·cols + col), 0 for none. */
  grid: number[];
  /** Bumped on every grid change, so cached flow fields know to rebuild. */
  pathVersion: number;
  wave: WaveState;
  creeps: Creep[];
  towers: Tower[];
  projectiles: Projectile[];
  /** The Game Mode's own state, a plain JSON object it defines. */
  mode: M;
}

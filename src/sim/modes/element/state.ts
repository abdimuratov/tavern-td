import {
  ELEMENTS, ELEMENT_CREEPS, ELEMENT_SHOTS, ELEMENT_TOWERS,
  type DamageElement, type Draw, type Element, type ElementCreepSpec, type ElementTowerInfo, type ElementTowerSpec,
  type Picks, type RunLength,
} from '../../../content/element';
import type { SimEvent } from '../../core/events';
import type { GameModeRules, Sim } from '../../core/mode';
import type { TowerSpec } from '../../core/specs';
import type { Creep, GameState, Tower } from '../../core/state';
import { TICK_RATE } from '../../core/constants';
import type { Json } from '../../core/types';
import { getMode } from '../registry';

export const ELEMENT_MODE_ID = 'element';

/** Per-tower state the core doesn't keep. Every field is always present, so saves serialize byte for byte. */
export interface ElementTowerState {
  /** Tick it finishes (re)building; it neither attacks nor casts before. */
  ready: number;
  /** Creep its streak is on (Light, Fire, Quark), 0 for none. */
  last: number;
  /** Streak or stack count (Light, Fire, Quark, Tidal, Magic, Haste, Ephemeral). */
  stacks: number;
  /** Tick of its last attack or hit, for stacks that lapse (Magic, Haste, Tidal, Ephemeral). */
  lastAt: number;
  /** Attacks toward a periodic effect (Hail's storm, Quake's pulverize), or the Periodic tower's cycle start. */
  count: number;
  /** Tick its ability may act again (support casts, autocasts, pulses, tornadoes). */
  castAt: number;
  /** Tick an active state ends: Runic's magic attack, Ephemeral's stack buff; -1 for none. */
  activeUntil: number;
  /** Ephemeral's one-second stack timer, -1 when it isn't running. */
  timer: number;
  /** Vengeance stacks on it: the tick each expires. */
  vengeance: number[];
  /** A Trickery copy: the Trickery that made it and the tick it vanishes; null for a real tower. */
  clone: { by: number; until: number } | null;
  /** It can't be copied again before this tick. */
  noCloneUntil: number;
}

/** Per-creep state for its trait and the debuffs Element tracks itself. */
export interface ElementCreepState {
  /** Tick it spawned: fast, mechanical, regen and time-lapse timing count from here. */
  born: number;
  /** Tick of its first mechanical shield, -1 without the trait. */
  mech: number;
  /** HP regen has restored so far. */
  healed: number;
  /** Undead lying dead: the tick it rises, -1 otherwise. */
  dead: number;
  /** An undead creep in its second life. */
  revived: boolean;
  /** Time lapse samples [tick, distance along the route, HP], oldest first. */
  lapse: [number, number, number][];
  /** Time lapse has rewound it (once per creep). */
  lapsed: boolean;
  /** Napalm stored on it; never reset (FlamethrowerTower.lua). */
  napalm: number;
  /** Tick its napalm debuff lapses and explodes, -1 when it has none. */
  napalmUntil: number;
  napalmBy: number;
  /** No Ice-type stun before this tick. */
  iceUntil: number;
  /** Jinx mark: HP when marked, the Jinx and its %, the next tick and ticks left; null when unmarked. */
  jinx: { hp: number; by: number; pct: number; next: number; left: number } | null;
  /** Polar frostbite: HP taken and the tick it returns; null when unmarked. */
  frost: { amount: number; until: number } | null;
}

/** Something due on a later tick, processed in insertion order (the port's same-frame timers). */
export type ElementTimer =
  /** Earth's aftershock: the splash again at the impact point. */
  | { kind: 'aftershock'; at: number; tower: number; x: number; y: number; damage: number; full: number; half: number; elem: DamageElement }
  /** Flooding's flood: `damage` within `radius` of a fixed point, `left` more times a second apart. */
  | { kind: 'flood'; at: number; tower: number; x: number; y: number; damage: number; radius: number; left: number; elem: DamageElement }
  /** A stacking damage-over-time instance on one creep (Poison, Erosion's acid, Roots). */
  | { kind: 'dot'; at: number; tower: number; creep: number; damage: number; every: number; left: number; elem: DamageElement }
  /** Flame's sunburn: every second until `end`, everything within `radius` of the creep burns. */
  | { kind: 'sunburn'; at: number; tower: number; creep: number; damage: number; radius: number; end: number; elem: DamageElement }
  /** A sunburn that outlived its creep, burning on the spot. */
  | { kind: 'remnant'; at: number; tower: number; x: number; y: number; damage: number; radius: number; left: number; elem: DamageElement }
  /** Electricity's chain: bounce `jump` from (x, y), searching `radius`, skipping the creep just hit. */
  | {
    kind: 'chain'; at: number; tower: number; last: number; x: number; y: number; jump: number; jumps: number;
    radius: number; shrink: number; damage: number; grow: number; elem: DamageElement;
  };

/** A Windstorm tornado chasing a creep. */
export interface Tornado {
  tower: number;
  x: number;
  y: number;
  /** Creep it chases, 0 once that creep is gone. */
  target: number;
  damage: number;
  radius: number;
  speed: number;
  slow: number;
  level: number;
  born: number;
  end: number;
}

/** A random Element (or Pure Essence) waiting for its Lumber. `after` is the Wave whose clear brings it; 0 is the start. */
export interface ElementDraw {
  after: number;
  pick: Draw;
  done: boolean;
}

export interface InterestState {
  /** Tick of the next payout; -1 before Wave 1's first spawn, while paused, or once stopped. */
  next: number;
  /** While paused: ticks that were left to the payout; -1 otherwise. */
  left: number;
  /** Waves whose leaks hold the pause until they are cleared. */
  locks: number[];
  stopped: boolean;
}

export interface ElementState {
  picks: Picks;
  length: RunLength;
  lumber: number;
  essence: number;
  /** Pure Essence bought with Lumber so far. */
  essenceBought: number;
  /** All Pick Full: summons that grant their level at once. */
  freeElements: number;
  levels: Record<Element, number>;
  /** All Random's whole order, drawn at setup. */
  draws: ElementDraw[];
  /** Tick the next Wave starts on its own; -1 during a Wave or when none is left. */
  breakUntil: number;
  /** Length of the current break in ticks, for a countdown bar. */
  breakTicks: number;
  /** Waves cleared. */
  completed: number;
  interest: InterestState;
  /** Leaks of the Wave being fought (they spoil its clean bonus). */
  waveLeaks: number;
  score: number;
  /** Tick of Wave 1's first spawn, -1 before. */
  firstSpawn: number;
  /** Tick the last fixed Wave (55, Express 30) was cleared, -1 before. */
  clearTick: number;
  /** Boss creeps killed in the boss Wave being fought (bulky counts 2). */
  bossKills: number;
  /** Life towers' shared points toward the next life. */
  lifePoints: number;
  towers: { [id: string]: ElementTowerState };
  creeps: { [id: string]: ElementCreepState };
  timers: ElementTimer[];
  tornadoes: Tornado[];
}

export type ElementGameState = GameState<ElementState>;

export const ELEMENT_RULE_TOWERS: Readonly<Record<string, TowerSpec>> = { ...ELEMENT_TOWERS, ...ELEMENT_SHOTS };

export function elState(state: GameState): ElementState {
  return state.mode as ElementState;
}

export function rulesOf(state: GameState): GameModeRules {
  return getMode(state.modeId);
}

export function makeSim(state: GameState, events: SimEvent[]): Sim {
  return { state, rules: rulesOf(state), events };
}

export function towerSpec(spec: string): ElementTowerSpec | undefined {
  return Object.hasOwn(ELEMENT_TOWERS, spec) ? ELEMENT_TOWERS[spec] : undefined;
}

export function towerInfoOf(spec: string): ElementTowerInfo | undefined {
  return towerSpec(spec)?.element;
}

export function creepSpec(spec: string): ElementCreepSpec | undefined {
  return Object.hasOwn(ELEMENT_CREEPS, spec) ? ELEMENT_CREEPS[spec] : undefined;
}

export function newLevels(): Record<Element, number> {
  return Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
}

export function newTowerState(ready: number): ElementTowerState {
  return {
    ready, last: 0, stacks: 0, lastAt: -1, count: 0, castAt: ready, activeUntil: -1, timer: -1,
    vengeance: [], clone: null, noCloneUntil: -1,
  };
}

export function newCreepState(born: number): ElementCreepState {
  return {
    born, mech: -1, healed: 0, dead: -1, revived: false, lapse: [], lapsed: false,
    napalm: 0, napalmUntil: -1, napalmBy: 0, iceUntil: -1, jinx: null, frost: null,
  };
}

/** The tower's Element state without creating it, for read-only questions. */
export function peekTower(state: GameState, tower: Tower): ElementTowerState {
  const towers = elState(state).towers;
  const key = String(tower.id);
  return Object.hasOwn(towers, key) ? towers[key]! : newTowerState(-1);
}

/** The tower's Element state, created on first use. */
export function towerState(state: GameState, tower: Tower): ElementTowerState {
  const towers = elState(state).towers;
  const key = String(tower.id);
  if (!Object.hasOwn(towers, key)) towers[key] = newTowerState(state.tick);
  return towers[key]!;
}

export function towerStateById(state: GameState, id: number): ElementTowerState | undefined {
  const towers = elState(state).towers;
  const key = String(id);
  return Object.hasOwn(towers, key) ? towers[key] : undefined;
}

export function creepState(state: GameState, creep: Creep): ElementCreepState {
  const creeps = elState(state).creeps;
  const key = String(creep.id);
  if (!Object.hasOwn(creeps, key)) creeps[key] = newCreepState(state.tick);
  return creeps[key]!;
}

export function peekCreep(state: GameState, creep: Creep): ElementCreepState | undefined {
  const creeps = elState(state).creeps;
  const key = String(creep.id);
  return Object.hasOwn(creeps, key) ? creeps[key] : undefined;
}

export function isBuilt(state: GameState, tower: Tower): boolean {
  return state.tick >= peekTower(state, tower).ready;
}

export function isClone(state: GameState, tower: Tower): boolean {
  return peekTower(state, tower).clone !== null;
}

export function modeEvent(events: SimEvent[], name: string, data: Json): void {
  events.push({ type: 'mode', name, data });
}

/** Round half up, the port's `round` (util.lua). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** Seconds to whole ticks at 30 Hz. */
export function ticks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

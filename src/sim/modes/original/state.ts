import {
  ORIGINAL_CREEPS, ORIGINAL_TOWERS,
  type OriginalCreepInfo, type OriginalCreepSpec, type OriginalTowerInfo, type OriginalTowerSpec, type OriginalWave, type Targeting,
} from '../../../content/original';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { Sim } from '../../core/mode';
import type { Creep, GameState, Tower } from '../../core/state';
import type { Json } from '../../core/types';
import { getMode } from '../registry';

export const ORIGINAL_MODE_ID = 'original';

/** Per-tower state the core doesn't keep. Every field is always present, so saves serialize byte for byte. */
export interface OriginalTowerState {
  /** Gold spent on it in all, discounts included: what selling refunds a share of. */
  spent: number;
  /** Gold spent on it since Break number `freshBreak` began; refunded in full while that Break is the latest. */
  fresh: number;
  freshBreak: number;
  xp: number;
  /** Tower Level, 1–10. */
  level: number;
  targeting: Targeting;
  /** Attacks fired (arrows, for the Arrow family), for the every-Nth Perks. */
  shots: number;
  /** Tick its timed Perk (Frost Nova, War Drums) is next ready. */
  perkAt: number;
  /** The beam's creep, 0 for none, and the tick it locked on. */
  beamOn: number;
  beamSince: number;
}

/** Per-creep state for its defences, its boss behaviour and the towers that touched it. */
export interface OriginalCreepState {
  /** Threat of its Wave; what its Shield, splits and calls scale with. */
  threat: number;
  /** Dropped by another creep (a split, a brood, a call): it pays no bounty. */
  dropped: boolean;
  /** Its Shield: a flat block per hit, 0 for none. */
  shield: number;
  /** A temporary Shield on top (the Riftlord's), until tick `boostUntil`. */
  boost: number;
  boostUntil: number;
  /** Towers that hit or slowed it, as [tower, tick] pairs laid flat: the Assists. */
  touched: number[];
  /** Boss: thresholds crossed (1 once the Gravelord enrages). */
  phase: number;
  /** Boss brood: the tick of its next drop, -1 for none. */
  next: number;
}

/** A Plague Cauldron's cloud: everything inside is poisoned while it lasts. */
export interface Cloud {
  tower: number;
  x: number;
  y: number;
  radius: number;
  dps: number;
  /** Ticks a creep stays poisoned after it leaves. */
  linger: number;
  air: boolean;
  until: number;
}

export interface OriginalState {
  /** The Stage's number (1–12). */
  stage: number;
  /** Threat of Wave 1. */
  threat: number;
  /** The Talents held for this Run, by id. Fixed for the Run. */
  talents: string[];
  /** Campaign progress the Run was started with: Stages finished, which sets the unlocks. */
  cleared: number;
  /** Custom Waves (tests, tools), or null for the Stage's own. */
  waves: OriginalWave[] | null;
  /** Tick the running Break ends and the next Wave starts on its own; -1 when no Break is running. */
  breakUntil: number;
  /** Length of the current Break in ticks, for a countdown bar. */
  breakTicks: number;
  /** Breaks begun so far: 0 before Wave 1, which counts as a Break for refunds. */
  breaks: number;
  /** The latest Wave whose last creep has spawned (its Break began then). */
  breakAfter: number;
  /** Waves cleared. */
  completed: number;
  /** Creeps leaked. */
  leaks: number;
  /** Bounty owed but not yet paid, in hundredths of gold: bounties are fractions of a Wave's pool. */
  carry: number;
  /** Gold earned from early calls. */
  earlyGold: number;
  /** Tick Wave 1 started, and the tick the last Wave was cleared; -1 before. */
  startTick: number;
  endTick: number;
  towers: { [id: string]: OriginalTowerState };
  creeps: { [id: string]: OriginalCreepState };
  clouds: Cloud[];
}

export type OriginalGameState = GameState<OriginalState>;

export function orState(state: GameState): OriginalState {
  return state.mode as OriginalState;
}

export function makeSim(state: GameState, events: SimEvent[]): Sim {
  return { state, rules: getMode(state.modeId), events };
}

export function towerSpec(spec: string | null): OriginalTowerSpec | undefined {
  return spec !== null && Object.hasOwn(ORIGINAL_TOWERS, spec) ? ORIGINAL_TOWERS[spec] : undefined;
}

export function towerInfo(spec: string | null): OriginalTowerInfo | undefined {
  return towerSpec(spec)?.original;
}

export function creepSpec(spec: string): OriginalCreepSpec | undefined {
  return Object.hasOwn(ORIGINAL_CREEPS, spec) ? ORIGINAL_CREEPS[spec] : undefined;
}

export function creepInfo(spec: string): OriginalCreepInfo | undefined {
  return creepSpec(spec)?.original;
}

export function newTowerState(targeting: Targeting, freshBreak: number): OriginalTowerState {
  return { spent: 0, fresh: 0, freshBreak, xp: 0, level: 1, targeting, shots: 0, perkAt: -1, beamOn: 0, beamSince: 0 };
}

export function newCreepState(threat: number): OriginalCreepState {
  return { threat, dropped: false, shield: 0, boost: 0, boostUntil: -1, touched: [], phase: 0, next: -1 };
}

/** The tower's state, or undefined for a tower the Original didn't build. */
export function peekTower(state: GameState, id: number): OriginalTowerState | undefined {
  const towers = orState(state).towers;
  const key = String(id);
  return Object.hasOwn(towers, key) ? towers[key] : undefined;
}

export function towerState(state: GameState, tower: Tower): OriginalTowerState {
  const towers = orState(state).towers;
  const key = String(tower.id);
  if (!Object.hasOwn(towers, key)) towers[key] = newTowerState(towerInfo(tower.spec)?.targeting ?? 'first', orState(state).breaks);
  return towers[key]!;
}

export function peekCreep(state: GameState, creep: Creep): OriginalCreepState | undefined {
  const creeps = orState(state).creeps;
  const key = String(creep.id);
  return Object.hasOwn(creeps, key) ? creeps[key] : undefined;
}

export function creepState(state: GameState, creep: Creep): OriginalCreepState {
  const creeps = orState(state).creeps;
  const key = String(creep.id);
  if (!Object.hasOwn(creeps, key)) creeps[key] = newCreepState(threatOf(state, creep.wave));
  return creeps[key]!;
}

/** Threat of Wave `wave` (Wave 1 for creeps outside a Wave). */
export function threatOf(state: GameState, wave: number): number {
  return orState(state).threat + Math.max(1, wave) - 1;
}

export function modeEvent(events: SimEvent[], name: string, data: Json): void {
  events.push({ type: 'mode', name, data });
}

/** Seconds to whole ticks at 30 Hz, at least one. */
export function ticks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

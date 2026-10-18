import { MAUL_CREEPS, MAUL_TOWERS, type MaulCreepSpec, type MaulTowerSpec, type MaulWave, type RaceId } from '../../../content/maul';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { GameModeRules, Sim } from '../../core/mode';
import type { GameState } from '../../core/state';
import type { Json } from '../../core/types';
import { getMode } from '../registry';

export const MAUL_MODE_ID = 'maul';

/** What Maul keeps per tower. Every field is always present, so saves serialize byte for byte. */
export interface MaulTowerState {
  /** Gold paid for it so far, every upgrade included. */
  paid: number;
  /** The part of `paid` spent while the field was clear before the next Wave: selling returns it in full. */
  fresh: number;
}

export interface MaulState {
  /** The Race picked at New Run, then the second one if it has joined. */
  races: RaceId[];
  /** Waves instead of the 40 (tests and tools); null for the real ones. */
  waves: MaulWave[] | null;
  /** Tick the next Wave starts on its own; -1 during a Wave and once none is left. */
  breakUntil: number;
  /** Length of the current Break in ticks, for a countdown bar. */
  breakTicks: number;
  /** Waves cleared. */
  completed: number;
  /** Creeps that reached the exit this Run. */
  leaks: number;
  kills: number;
  score: number;
  /** Hundredths of a gold the bounty owes but hasn't paid (fractional), so the pool pays out whole gold. */
  carry: number;
  /** Per Wave still on the Map: hundredths of a gold each point of a creep's max HP pays. */
  bountyRate: { [wave: string]: number };
  /** Live creeps a mid-Wave build or sale has turned around this Run. */
  turned: number;
  /** Builds and sales that turned at least one creep. */
  juggles: number;
  /** Interest paid this Run. */
  interest: number;
  /** During a Break, gold spent comes back in full on a sale until the next Wave starts. */
  refundOpen: boolean;
  /** Tick Wave 1 started and the tick the last Wave was cleared; -1 before. */
  startTick: number;
  endTick: number;
  towers: { [id: string]: MaulTowerState };
}

export type MaulGameState = GameState<MaulState>;

export function mlState(state: GameState): MaulState {
  return state.mode as MaulState;
}

export function makeSim(state: GameState, events: SimEvent[]): Sim {
  return { state, rules: getMode(state.modeId) as GameModeRules, events };
}

export function towerSpec(spec: string): MaulTowerSpec | undefined {
  return Object.hasOwn(MAUL_TOWERS, spec) ? MAUL_TOWERS[spec] : undefined;
}

export function creepSpec(spec: string): MaulCreepSpec | undefined {
  return Object.hasOwn(MAUL_CREEPS, spec) ? MAUL_CREEPS[spec] : undefined;
}

export function modeEvent(events: SimEvent[], name: string, data: Json): void {
  events.push({ type: 'mode', name, data });
}

/** Seconds to whole ticks at 30 Hz. */
export function ticks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

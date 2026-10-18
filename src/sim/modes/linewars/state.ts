import { FIELD_WIDTH, RIVAL_INCOME, fieldOfCol, type SendId, type SkillId } from '../../../content/linewars';
import type { RaceId } from '../../../content/maul';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { RngState } from '../../core/rng';
import type { Creep, GameState, Tower } from '../../core/state';
import type { Json } from '../../core/types';
import { cellCol } from '../../path/grid';

export const LW_MODE_ID = 'linewars';

/** Who plays a Side: a person through the command log, or the sim's AI. */
export type Driver = 'human' | 'ai';
/** Side 0 is you, Side 1 the Rival (CONTEXT.md). */
export type SideId = 0 | 1;
export const SIDE_IDS: readonly SideId[] = [0, 1];

/** A Send that entered a Side's Field: what the AI's mix and defense floor count. */
export interface LwInbound {
  tick: number;
  send: SendId;
  /** HP of all its creeps together. */
  hp: number;
}

/** One Side's purse and tallies. Every field is always present, so saves serialize byte for byte. */
export interface LwSide {
  driver: Driver;
  race: RaceId;
  gold: number;
  /** Per income tick, before the Rival's Difficulty factor. */
  income: number;
  lives: number;
  stock: { [send: string]: number };
  /** Tick of each Send's next +1 to Stock; -1 while it is locked or full. */
  restock: { [send: string]: number };
  /** Its creeps alive in the other Field, against the cap of 40. */
  live: number;
  /** Sends it bought, the lives its Leaks took, the creeps it killed in its Field and the bounty they paid. */
  sent: number;
  stolen: number;
  killed: number;
  bounty: number;
  /** Creeps its builds and sales turned around, and the juggles that did it. */
  turned: number;
  juggles: number;
  /** Every gold it has earned: the start, each income tick and bounty; sales aside. */
  earned: number;
  /** Gold it spent on Sends. */
  spent: number;
  /** Creeps that leaked out of its Field, the lives they took, flyers among them, and the tick of the last; -1 before any. */
  leaked: number;
  lost: number;
  airLeaks: number;
  leakTick: number;
  /** Sends that entered its Field in the last two minutes, oldest first. */
  inbound: LwInbound[];
  /** Bumped by every build, upgrade and sale in its Field, so cached maps of it know to rebuild. */
  version: number;
}

/** The AI's memory for one Side (design §11): plain JSON, so a save resumes it mid-thought. */
export interface LwAi {
  skill: SkillId;
  /** Its own RNG stream, apart from the Run's, so its variations never shift combat rolls. */
  rng: RngState;
  /** The blueprint's first gap opens at the other end. */
  flip: boolean;
  /** Blueprint Walls (by index) it leaves out: Easy's shortcuts. */
  skip: number[];
  /** Tick its salvos start, jitter included; -1 for greed only until Sudden Death. */
  salvoTick: number;
  /** The last salvo bought, its creeps' ids, and its Side's steals when it was bought. */
  salvo: string[];
  salvoCreeps: number[];
  salvoStolen: number;
  /** A salvo that stole well, to buy again before a new one is planned; empty for none. */
  repeat: string[];
  /** Gold set aside for salvos, and its Side's gold earned when it last looked. */
  bank: number;
  earnedSeen: number;
  /** λ added after its Field leaked, when it was last raised, and the leaks it has seen. */
  boost: number;
  boostTick: number;
  leaksSeen: number;
  /** The opening's first Wall, upgraded at once; 0 until built. */
  first: number;
  /** Commands it has applied this Run. */
  applied: number;
}

export interface LwState {
  sides: [LwSide, LwSide];
  /** Gold paid into each tower so far, every upgrade included, for its sale value. */
  towers: { [id: string]: number };
  result: 'playing' | 'side0' | 'side1' | 'draw';
  why: '' | 'lives' | 'drain' | 'income' | 'draw';
  /** Tick the Run ended; -1 while it runs. */
  endTick: number;
  /** Side 0's score (§14). */
  score: number;
  /** The AI's memory for each AI-driven Side, null for a human Side. */
  ai: [LwAi | null, LwAi | null];
}

export type LwGameState = GameState<LwState>;

export function lwState(state: GameState): LwState {
  return state.mode as LwState;
}

export function sideOf(state: GameState, side: SideId): LwSide {
  return lwState(state).sides[side];
}

export function other(side: SideId): SideId {
  return side === 0 ? 1 : 0;
}

/** True when `v` names a Side. */
export function isSide(v: unknown): v is SideId {
  return v === 0 || v === 1;
}

/** The Side a tower belongs to: the Field its cells are in. -1 for none (a tower the rules never build). */
export function towerSide(state: GameState, tower: Tower): -1 | SideId {
  return fieldOfCol(cellCol(state.map, tower.cell));
}

/** The Field a creep walks: its spawn's. Its sender is the other Side. */
export function creepField(creep: Creep): SideId {
  return (creep.spawn ?? 0) < FIELD_WIDTH ? 0 : 1;
}

export function modeEvent(events: SimEvent[], name: string, data: Json): void {
  events.push({ type: 'mode', name, data });
}

/** Seconds to whole ticks at 30 Hz. */
export function ticks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

/** A Side's gold changes only here. Side 0's is copied to the core's `gold`, for the shared HUD and save summaries. */
export function earn(state: GameState, side: SideId, amount: number, events: SimEvent[]): void {
  if (amount === 0) return;
  const s = sideOf(state, side);
  s.gold += amount;
  if (side === 0) {
    state.gold = s.gold;
    events.push({ type: 'goldChanged', gold: state.gold, delta: amount });
  }
}

/** Spends a Side's gold if it has it; false (and nothing spent) otherwise. */
export function spend(state: GameState, side: SideId, amount: number, events: SimEvent[]): boolean {
  if (amount > sideOf(state, side).gold) return false;
  earn(state, side, -amount, events);
  return true;
}

/** What `side` is paid each income tick: its income, times the Difficulty's factor for the Rival (design §9). */
export function payOf(state: GameState, side: SideId): number {
  const income = sideOf(state, side).income;
  return side === 1 ? Math.floor(income * RIVAL_INCOME[state.difficulty]) : income;
}

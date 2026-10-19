import {
  CHECKPOINT_EVERY, DRAIN_LIVES, INBOUND_SECONDS, INCOME_SECONDS, LW_CREEPS, LW_MAP, SCORE, SEND_IDS, SKILLS,
  START_GOLD, START_INCOME, START_LIVES, sendOfCreep, type SkillId,
} from '../../../content/linewars';
import { MAUL_DAMAGE_TABLE, MAUL_TOWERS, RACES, TROLL_REGEN, type RaceId } from '../../../content/maul';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { GameModeRules, RunOptions } from '../../core/mode';
import { nextInt } from '../../core/rng';
import type { GameState } from '../../core/state';
import { setMap } from '../../path/grid';
import { newAi } from './ai/memory';
import { runAi } from './ai';
import { applyLwCommand, isLwCommand } from './commands';
import { leakSteal, runStock, suddenTick } from './sends';
import {
  LW_MODE_ID, creepField, earn, lwState, modeEvent, other, payOf, ticks,
  type Driver, type LwSide, type LwState, type SideId,
} from './state';

// The Line Wars Game Mode: Line Tower Wars as a duel against a Rival
// (docs/line-wars-design.md). Two Sides share one sim (ADR-0003): each Side's
// gold, income, lives and Stock live in `state.mode`, the core's `gold` is a
// copy of Side 0's, and its `lives` stays at 1 so the core never ends the Run;
// Line Wars ends it itself. Every command names its Side and goes through one
// handler, whether it comes from the log or from the AI.

/** Line Wars' Run settings, in RunOptions.options. */
export interface LwOptions {
  /** Side 0's Race. */
  readonly race: RaceId;
  /** The Rival's: drawn at setup from the Run's RNG by default. */
  readonly rivalRace: RaceId | 'random';
  /** Who plays each Side. Versus will pass ['human', 'human']; tools pass ['ai', 'ai']. */
  readonly drivers: readonly [Driver, Driver];
  /** Each AI Side's skill profile (tools); Side 1 defaults to the Difficulty, Side 0 to `competent`. */
  readonly skills: readonly [SkillId | null, SkillId | null];
  /** Starting gold and lives for both Sides instead of 150 and 30 (tests and tools). */
  readonly gold: number | null;
  readonly lives: number | null;
}

export const DEFAULT_OPTIONS: LwOptions = {
  race: 'ironclad', rivalRace: 'random', drivers: ['human', 'ai'], skills: [null, null], gold: null, lives: null,
};

function isRace(v: unknown): v is RaceId {
  return typeof v === 'string' && (RACES as readonly string[]).includes(v);
}

function pair<T>(v: unknown, name: string, ok: (x: unknown) => x is T): [T, T] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(ok)) throw new Error(`Line Wars: ${name} must name both Sides`);
  return [v[0] as T, v[1] as T];
}

function wholeOrNull(v: unknown, min: number, name: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw new Error(`Line Wars: ${name} must be a whole number of ${min} or more`);
  return v;
}

/** The Run settings with defaults filled in; throws on settings it can't play. */
export function lwOptions(opts: RunOptions): LwOptions {
  const o = opts.options ?? {};
  const race = o['race'] ?? DEFAULT_OPTIONS.race;
  if (!isRace(race)) throw new Error(`Line Wars has no Race ${String(race)}`);
  const rivalRace = o['rivalRace'] ?? DEFAULT_OPTIONS.rivalRace;
  if (rivalRace !== 'random' && !isRace(rivalRace)) throw new Error(`Line Wars has no Race ${String(rivalRace)}`);
  const drivers = pair(o['drivers'] ?? DEFAULT_OPTIONS.drivers, 'drivers', (x): x is Driver => x === 'human' || x === 'ai');
  const skills = pair(o['skills'] ?? DEFAULT_OPTIONS.skills, 'skills',
    (x): x is SkillId | null => x === null || (typeof x === 'string' && (SKILLS as readonly string[]).includes(x)));
  return {
    race, rivalRace, drivers, skills,
    gold: wholeOrNull(o['gold'], 0, 'gold'), lives: wholeOrNull(o['lives'], 1, 'lives'),
  };
}

function newSide(driver: Driver, race: RaceId, gold: number, lives: number): LwSide {
  const stock: { [send: string]: number } = {};
  const restock: { [send: string]: number } = {};
  for (const id of SEND_IDS) {
    stock[id] = 0;
    restock[id] = -1;
  }
  return {
    driver, race, gold, income: START_INCOME, lives, stock, restock, live: 0,
    sent: 0, stolen: 0, killed: 0, bounty: 0, turned: 0, juggles: 0,
    earned: gold, spent: 0, leaked: 0, lost: 0, airLeaks: 0, leakTick: -1, inbound: [], version: 0,
  };
}

type State = GameState<LwState>;

/** Ends the Run: `winner` wins, or nobody (a draw). Side 0 winning is `won`; anything else is `lost`. */
export function endRun(state: GameState, winner: SideId | null, why: LwState['why'], events: SimEvent[]): void {
  const ms = lwState(state);
  if (ms.result !== 'playing') return;
  ms.result = winner === null ? 'draw' : winner === 0 ? 'side0' : 'side1';
  ms.why = why;
  ms.endTick = state.tick;
  if (winner === 0) {
    const left = Math.max(0, Math.floor((ticks(SCORE.clock) - state.tick) / TICK_RATE));
    ms.score += SCORE.win + SCORE.perSecond * left + SCORE.perLife * ms.sides[0].lives;
  }
  state.phase = winner === 0 ? 'won' : 'lost';
  modeEvent(events, 'lw.end', { result: ms.result, why, tick: state.tick });
  events.push({ type: state.phase === 'won' ? 'won' : 'lost' });
}

/** Both Sides are paid; in Sudden Death each then loses DRAIN_LIVES, and the Run ends if a Side is out. */
function incomeTick(state: State, events: SimEvent[]): void {
  const ms = state.mode;
  const pays = [payOf(state, 0), payOf(state, 1)];
  for (const side of [0, 1] as const) {
    earn(state, side, pays[side]!, events);
    ms.sides[side].earned += pays[side]!;
    const keep = state.tick - ticks(INBOUND_SECONDS);
    const inbound = ms.sides[side].inbound;
    let drop = 0;
    while (drop < inbound.length && inbound[drop]!.tick < keep) drop++;
    if (drop > 0) inbound.splice(0, drop);
  }
  modeEvent(events, 'lw.income', { pay: pays, income: [ms.sides[0].income, ms.sides[1].income] });
  if (state.tick < suddenTick()) return;
  if (state.tick === suddenTick()) modeEvent(events, 'lw.sudden', { tick: state.tick });
  for (const s of ms.sides) s.lives = Math.max(0, s.lives - DRAIN_LIVES);
  modeEvent(events, 'lw.drain', { lives: [ms.sides[0].lives, ms.sides[1].lives] });
  const out0 = ms.sides[0].lives <= 0;
  const out1 = ms.sides[1].lives <= 0;
  if (out0 && out1) {
    const [a, b] = [ms.sides[0].income, ms.sides[1].income];
    if (a === b) endRun(state, null, 'draw', events);
    else endRun(state, a > b ? 0 : 1, 'income', events);
  } else if (out0) {
    endRun(state, 1, 'drain', events);
  } else if (out1) {
    endRun(state, 0, 'drain', events);
  }
}

function setupRun(state: State, opts: RunOptions): void {
  const options = lwOptions(opts);
  if (opts.map !== undefined) throw new Error('Line Wars plays only on the Twin Fields');
  setMap(state, LW_MAP);
  const rival: RaceId = options.rivalRace === 'random' ? RACES[nextInt(state.rng, 0, RACES.length - 1)]! : options.rivalRace;
  const gold = options.gold ?? START_GOLD;
  const lives = options.lives ?? START_LIVES;
  state.wave.total = 0;
  state.gold = gold;
  // The core's lives are a sentinel: Line Wars keeps each Side's and ends the Run itself.
  state.lives = 1;
  state.mode = {
    sides: [newSide(options.drivers[0], options.race, gold, lives), newSide(options.drivers[1], rival, gold, lives)],
    towers: {},
    result: 'playing',
    why: '',
    endTick: -1,
    score: 0,
    ai: [null, null],
  };
  for (const side of [0, 1] as const) {
    if (options.drivers[side] !== 'ai') continue;
    const skill = options.skills[side] ?? (side === 1 ? state.difficulty : 'competent');
    state.mode.ai[side] = newAi(state, side, skill);
  }
}

export const LW_RULES: GameModeRules<LwState> = {
  id: LW_MODE_ID,
  towers: MAUL_TOWERS,
  creeps: LW_CREEPS,
  damageTable: MAUL_DAMAGE_TABLE,
  setup: setupRun,
  handleCommand(state, command, events) {
    if (!isLwCommand(command.type)) return false;
    applyLwCommand(state, command, events, 'log');
    return true;
  },
  // There are no Waves: the core's startWave is refused with "no Waves left".
  onTick(state, events) {
    runStock(state, events);
    if (state.tick > 0 && state.tick % ticks(INCOME_SECONDS) === 0) {
      incomeTick(state, events);
      if (state.mode.result !== 'playing') return;
    }
    // Trolls heal a share of their max HP every second, as in Maul.
    for (const c of state.creeps) {
      if (c.hp > 0 && c.hp < c.maxHp && LW_CREEPS[c.spec]?.maul.kind === 'regen') c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * TROLL_REGEN) / TICK_RATE);
    }
    runAi(state, 0, events);
    runAi(state, 1, events);
    if (state.tick > 0 && state.tick % ticks(INCOME_SECONDS * CHECKPOINT_EVERY) === 0) modeEvent(events, 'lw.checkpoint', { tick: state.tick });
  },
  onKill(state, creep, _tower, events) {
    const send = sendOfCreep(creep.spec);
    if (!send) return;
    const ms = state.mode;
    const field = creepField(creep);
    const sender = ms.sides[other(field)];
    sender.live = Math.max(0, sender.live - 1);
    if (ms.result !== 'playing') return;
    const d = ms.sides[field];
    d.killed++;
    d.bounty += send.bounty;
    d.earned += send.bounty;
    earn(state, field, send.bounty, events);
    if (field === 0) ms.score += send.bounty;
  },
  onLeak(state, creep, events) {
    const send = sendOfCreep(creep.spec);
    const ms = state.mode;
    if (!send) return { lives: 0, then: 'remove' };
    const field = creepField(creep);
    const to = other(field);
    const sender = ms.sides[to];
    sender.live = Math.max(0, sender.live - 1);
    if (ms.result !== 'playing') return { lives: 0, then: 'remove' };
    const d = ms.sides[field];
    // Doubled in Sudden Death, and never more than the defender has, so the two Sides' lives stay conserved.
    const moved = Math.min(leakSteal(state, send), d.lives);
    d.lives -= moved;
    sender.lives += moved;
    sender.stolen += moved;
    d.leaked++;
    d.lost += moved;
    d.leakTick = state.tick;
    if (creep.air) d.airLeaks++;
    if (to === 0) ms.score += SCORE.perSteal * moved;
    modeEvent(events, 'lw.leak', { creep: creep.id, send: send.id, from: field, to, lives: moved });
    if (d.lives <= 0) endRun(state, to, 'lives', events);
    return { lives: 0, then: 'remove' };
  },
};

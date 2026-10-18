import {
  BREAK_SECONDS, FIRST_BREAK_SECONDS, MAUL_CREEPS, MAUL_DAMAGE_TABLE, MAUL_MAP, MAUL_TOWERS, MAUL_WAVES, RACE_SPECS, RACES,
  SECOND_RACE_AFTER, START_GOLD, START_LIVES, TROLL_REGEN,
  type MaulWave, type RaceId,
} from '../../../content/maul';
import { intArg, reject, stringArg, type Command } from '../../core/commands';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { GameModeRules, RunOptions } from '../../core/mode';
import type { GameState } from '../../core/state';
import { startNextWave } from '../../core/waves';
import { earnGold } from '../../economy';
import { setMap } from '../../path/grid';
import { build, buildError, sell, spotError, towerById, upgrade, upgradeError } from './build';
import { MAUL_MODE_ID, creepSpec, modeEvent, ticks, type MaulState } from './state';
import { bountyPool, interestOn, runWaves, waveBonus, waveSpec } from './waves';

// The Maul Game Mode: Wintermaul's rules with Tavern TD's numbers
// (docs/maul-design.md). Commands are `maul.*`; each checks its arguments and
// the moment, and on refusal emits `rejected` with a short reason a player can read.

/** Maul's commands. Towers are named by id; (col, row) is a 2 × 2 tower's top-left cell. */
export type MaulCommand =
  /** Build the Race's Wall, or either line's Tier 1, on open ground. */
  | { readonly type: 'maul.build'; readonly spec: string; readonly col: number; readonly row: number }
  /** Climb a Tier, or pick a fork at Tier 2. */
  | { readonly type: 'maul.upgrade'; readonly tower: number; readonly to: string }
  | { readonly type: 'maul.sell'; readonly tower: number }
  /** End the Break now; the next Wave starts at once and sending early pays nothing. */
  | { readonly type: 'maul.sendNow' }
  /** Add a second Race to the Run, once Wave 15 is cleared. */
  | { readonly type: 'maul.addRace'; readonly race: string };

export const MAUL_COMMANDS: readonly MaulCommand['type'][] = ['maul.build', 'maul.upgrade', 'maul.sell', 'maul.sendNow', 'maul.addRace'];

/** Maul's Run settings, in RunOptions.options. */
export interface MaulOptions {
  readonly race: RaceId;
  /** Waves instead of the 40 (tests and tools). */
  readonly waves: readonly MaulWave[] | null;
  /** Starting gold instead of 200 (tests and tools). */
  readonly gold: number | null;
}

export const DEFAULT_OPTIONS: MaulOptions = { race: 'ironclad', waves: null, gold: null };

/** The Run settings with defaults filled in; throws on settings it can't play. */
export function maulOptions(opts: RunOptions): MaulOptions {
  const o = opts.options ?? {};
  const race = o['race'] ?? DEFAULT_OPTIONS.race;
  if (typeof race !== 'string' || !(RACES as readonly string[]).includes(race)) throw new Error(`Maul has no Race ${String(race)}`);
  const waves = o['waves'] ?? null;
  if (waves !== null && (!Array.isArray(waves) || waves.length < 1)) throw new Error('Maul: waves must be a list of Waves');
  for (const w of (waves ?? []) as unknown[]) {
    const creep = (w as { creep?: unknown } | null)?.creep;
    if (typeof creep !== 'string' || !Object.hasOwn(MAUL_CREEPS, creep)) throw new Error(`Maul: no creep ${String(creep)}`);
  }
  const gold = o['gold'] ?? null;
  if (gold !== null && (typeof gold !== 'number' || !Number.isInteger(gold) || gold < 0)) throw new Error('Maul: gold must be a whole number');
  return { race: race as RaceId, waves: waves as unknown as MaulWave[] | null, gold };
}

function newState(options: MaulOptions): MaulState {
  return {
    races: [options.race],
    waves: options.waves ? JSON.parse(JSON.stringify(options.waves)) as MaulWave[] : null,
    breakUntil: ticks(FIRST_BREAK_SECONDS),
    breakTicks: ticks(FIRST_BREAK_SECONDS),
    completed: 0,
    leaks: 0,
    kills: 0,
    score: 0,
    carry: 0,
    bountyRate: {},
    turned: 0,
    juggles: 0,
    interest: 0,
    refundOpen: true,
    startTick: -1,
    endTick: -1,
    towers: {},
  };
}

type State = GameState<MaulState>;

function handle(state: State, command: Command, events: SimEvent[]): void {
  const no = (reason: string): void => reject(events, command, reason);
  switch (command.type as MaulCommand['type']) {
    case 'maul.build': {
      const spec = stringArg(command, 'spec');
      const col = intArg(command, 'col');
      const row = intArg(command, 'row');
      if (spec === null || col === null || row === null) return no('build needs spec, col and row');
      const refused = buildError(state, spec) ?? spotError(state, col, row);
      if (refused) return no(refused);
      build(state, spec, col, row, events);
      return;
    }
    case 'maul.upgrade': {
      const tower = towerById(state, intArg(command, 'tower'));
      const to = stringArg(command, 'to');
      if (to === null) return no('upgrade needs the tower to become');
      const refused = upgradeError(state, tower, to);
      if (refused || !tower) return no(refused ?? 'no such tower');
      upgrade(state, tower, to, events);
      return;
    }
    case 'maul.sell': {
      const tower = towerById(state, intArg(command, 'tower'));
      if (!tower || !state.mode.towers[String(tower.id)]) return no('no such tower');
      sell(state, tower, events);
      return;
    }
    case 'maul.sendNow': {
      const refused = sendNowError(state);
      if (refused) return no(refused);
      startNextWave(state, events);
      return;
    }
    case 'maul.addRace': {
      const race = stringArg(command, 'race');
      const refused = addRaceError(state, race);
      if (refused || race === null) return no(refused ?? 'addRace needs a Race');
      state.mode.races.push(race as RaceId);
      modeEvent(events, 'maul.raceAdded', { race });
      return;
    }
  }
}

/** Why the Break can't be cut short now, or null. */
export function sendNowError(state: GameState): string | null {
  if (state.phase === 'won' || state.phase === 'lost') return 'the Run is over';
  if (state.phase === 'wave') return 'a Wave is still running';
  if (state.wave.number >= state.wave.total) return 'no Wave left to send';
  return null;
}

/** Why `race` can't join the Run now, or null: one more Race, once Wave 15 is cleared. */
export function addRaceError(state: GameState, race: string | null): string | null {
  const ms = state.mode as MaulState;
  if (race === null || !(RACES as readonly string[]).includes(race)) return 'no such Race';
  if (ms.races.length >= 2) return 'the Run already has two Races';
  if (ms.races.includes(race as RaceId)) return `the ${RACE_SPECS[race as RaceId].name} are already here`;
  if (ms.completed < SECOND_RACE_AFTER) return `a second Race joins once Wave ${SECOND_RACE_AFTER} is cleared`;
  return null;
}

/** The Break before the next Wave: the field is clear, and the countdown runs. */
function startBreak(state: State, next: number, events: SimEvent[]): void {
  const ms = state.mode;
  ms.breakTicks = ticks(BREAK_SECONDS);
  ms.breakUntil = state.tick + ms.breakTicks;
  ms.refundOpen = true;
  modeEvent(events, 'maul.break', { wave: next, ticks: ms.breakTicks, until: ms.breakUntil });
}

function isMaulCommand(type: string): type is MaulCommand['type'] {
  return (MAUL_COMMANDS as readonly string[]).includes(type);
}

/** Hundredths of a gold of float error a bounty payout overlooks. */
const CARRY_SLACK = 1e-6;

/** Score for a kill: its Wave's number, ten times that for a boss. */
function killScore(wave: number, boss: boolean): number {
  return wave <= 0 ? 0 : boss ? wave * 10 : wave;
}

export const MAUL_RULES: GameModeRules<MaulState> = {
  id: MAUL_MODE_ID,
  towers: MAUL_TOWERS,
  creeps: MAUL_CREEPS,
  damageTable: MAUL_DAMAGE_TABLE,
  waveFor: (index, state) => waveSpec(state, index),
  setup(state, opts) {
    const options = maulOptions(opts);
    setMap(state, typeof opts.map === 'object' ? opts.map : MAUL_MAP);
    state.gold = options.gold ?? START_GOLD;
    state.lives = START_LIVES;
    state.mode = newState(options);
    state.wave.total = (options.waves ?? MAUL_WAVES).length;
  },
  handleCommand(state, command, events) {
    if (!isMaulCommand(command.type)) return false;
    handle(state, command, events);
    return true;
  },
  // The core's startWave works like maul.sendNow.
  canStartWave: (state) => sendNowError(state),
  onTick(state, events) {
    // Trolls heal a share of their max HP every second.
    for (const c of state.creeps) {
      if (c.hp > 0 && c.hp < c.maxHp && creepSpec(c.spec)?.maul.kind === 'regen') c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * TROLL_REGEN) / TICK_RATE);
    }
    const ms = state.mode;
    if (state.phase === 'build' && ms.breakUntil >= 0 && state.tick >= ms.breakUntil) startNextWave(state, events);
  },
  onWaveStart(state, wave, events) {
    const ms = state.mode;
    ms.breakUntil = -1;
    if (wave === 1) ms.startTick = state.tick;
    // Full refunds end once creeps are coming.
    ms.refundOpen = false;
    for (const ts of Object.values(ms.towers)) ts.fresh = 0;
    // The pool is split by each creep's share of the Wave's HP (Difficulty included, so every Difficulty earns the same).
    const active = state.wave.active.find((w) => w.number === wave);
    let hp = 0;
    for (const g of active?.groups ?? []) hp += g.count * g.hp;
    ms.bountyRate[String(wave)] = hp > 0 ? (bountyPool(wave) * 100) / hp : 0;
    const row = runWaves(state)[wave - 1];
    modeEvent(events, 'maul.wave', { wave, creep: row?.creep ?? '', air: creepSpec(row?.creep ?? '')?.flying ?? false });
  },
  onKill(state, creep, _tower, events) {
    const ms = state.mode;
    const rate = ms.bountyRate[String(creep.wave)] ?? 0;
    ms.carry += creep.maxHp * rate;
    // The pool splits into fractions of a gold; a hair of slack keeps float error from holding back the last one.
    const gold = Math.floor((ms.carry + CARRY_SLACK) / 100);
    ms.carry -= gold * 100;
    earnGold(state, gold, events);
    ms.kills++;
    ms.score += killScore(creep.wave, creepSpec(creep.spec)?.maul.kind === 'boss');
  },
  onWaveEnd(state, wave, events) {
    const ms = state.mode;
    const interest = interestOn(state.gold, wave);
    const bonus = waveBonus(wave);
    earnGold(state, bonus + interest, events);
    ms.interest += interest;
    ms.completed++;
    delete ms.bountyRate[String(wave)];
    modeEvent(events, 'maul.cleared', { wave, bonus, interest });
    if (ms.completed >= state.wave.total) {
      ms.endTick = state.tick;
      ms.score += state.lives * 100;
    } else {
      startBreak(state, wave + 1, events);
    }
  },
  onLeak(state, creep) {
    const ms = state.mode;
    ms.leaks++;
    const cs = creepSpec(creep.spec);
    // The last Wave's boss getting through ends the Run, as Wintermaul's did.
    if (cs?.maul.kind === 'boss' && creep.wave === state.wave.total) return { lives: Math.max(1, state.lives), then: 'remove' };
    return { lives: cs?.leakCost ?? 1, then: 'remove' };
  },
};

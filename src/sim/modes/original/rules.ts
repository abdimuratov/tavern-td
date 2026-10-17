import {
  BREAK_SECONDS, ORIGINAL_CREEPS, ORIGINAL_TOWERS, START_LIVES, stageByNumber,
  type OriginalWave,
} from '../../../content/original';
import { intArg, reject, stringArg, type Command } from '../../core/commands';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { GameModeRules, RunOptions } from '../../core/mode';
import type { GameState } from '../../core/state';
import { startNextWave } from '../../core/waves';
import { earnGold } from '../../economy';
import { setMap } from '../../path/grid';
import { runClouds } from './attack';
import { runAuras, runTimedPerks, towerBonus } from './auras';
import {
  build, buildError, isTargeting, sell, setTargeting, spotError, targetingError, towerById, upgrade, upgradeError,
} from './build';
import { initCreep, pruneCreeps, runCreepBehaviour } from './creeps';
import { talentsProblem } from './progression';
import { ORIGINAL_MODE_ID, creepSpec, makeSim, modeEvent, orState, threatOf, ticks, type OriginalState } from './state';
import { pickTarget } from './targeting';
import { earlyCallGold, waveBonus, waveSpec } from './waves';

// The Original Game Mode: Tavern TD's own Campaign (docs/original-design.md).
// Commands are `original.*`; each checks its arguments and the moment, and on
// refusal emits `rejected` with a short reason a player can read.

/** The Original's commands. Towers are named by id; Build Spots by their index in the Map's list. */
export type OriginalCommand =
  /** Build a family's Tier 1 tower on an empty Build Spot. */
  | { readonly type: 'original.build'; readonly spot: number; readonly spec: string }
  /** Climb a Tier, or pick a Specialisation at Tier 3. */
  | { readonly type: 'original.upgrade'; readonly tower: number; readonly to: string }
  | { readonly type: 'original.sell'; readonly tower: number }
  /** First, Last, Strong or Close; free at any time. */
  | { readonly type: 'original.target'; readonly tower: number; readonly targeting: string }
  /** Send the next Wave now: Wave 1, or end the Break early for the early-call gold. */
  | { readonly type: 'original.sendNow' };

export const ORIGINAL_COMMANDS: readonly OriginalCommand['type'][] = [
  'original.build', 'original.upgrade', 'original.sell', 'original.target', 'original.sendNow',
];

/** The Original's Run settings, in RunOptions.options. */
export interface OriginalOptions {
  /** The Stage played, 1–12. */
  readonly stage: number;
  /** The Talents held for the Run, by id. */
  readonly talents: readonly string[];
  /** Stages finished in the Campaign, which sets the unlocks; the Stage before this one by default. */
  readonly cleared: number;
  /** Waves to play instead of the Stage's own (tests and tools). */
  readonly waves: readonly OriginalWave[] | null;
  /** Starting gold instead of the Stage's (tests and tools). */
  readonly gold: number | null;
}

/** The Run settings with defaults filled in; throws on settings it can't play. */
export function originalOptions(opts: RunOptions): OriginalOptions {
  const o = opts.options ?? {};
  const stage = o['stage'] ?? 1;
  if (typeof stage !== 'number' || !stageByNumber(stage)) throw new Error(`The Original has no Stage ${String(stage)}`);
  const talents = o['talents'] ?? [];
  if (!Array.isArray(talents)) throw new Error('Original: talents must be a list of Talent ids');
  const problem = talentsProblem(talents);
  if (problem) throw new Error(`Original: ${problem}`);
  const cleared = o['cleared'] ?? stage - 1;
  if (typeof cleared !== 'number' || !Number.isInteger(cleared) || cleared < 0) throw new Error('Original: cleared must be a whole number of Stages');
  const waves = o['waves'] ?? null;
  if (waves !== null && !Array.isArray(waves)) throw new Error('Original: waves must be a list of Waves');
  const gold = o['gold'] ?? null;
  if (gold !== null && (typeof gold !== 'number' || !Number.isInteger(gold) || gold < 0)) throw new Error('Original: gold must be a whole number');
  return { stage, talents: talents as string[], cleared, waves: waves as unknown as OriginalWave[] | null, gold };
}

function newState(options: OriginalOptions, threat: number): OriginalState {
  return {
    stage: options.stage,
    threat,
    talents: [...options.talents],
    cleared: options.cleared,
    waves: options.waves ? JSON.parse(JSON.stringify(options.waves)) as OriginalWave[] : null,
    breakUntil: -1,
    breakTicks: 0,
    breaks: 0,
    breakAfter: 0,
    completed: 0,
    leaks: 0,
    carry: 0,
    earlyGold: 0,
    startTick: -1,
    endTick: -1,
    towers: {},
    creeps: {},
    clouds: [],
  };
}

type State = GameState<OriginalState>;

function handle(state: State, command: Command, events: SimEvent[]): void {
  const no = (reason: string): void => reject(events, command, reason);
  switch (command.type as OriginalCommand['type']) {
    case 'original.build': {
      const spot = intArg(command, 'spot');
      const spec = stringArg(command, 'spec');
      if (spot === null || spec === null) return no('build needs a Build Spot and a tower');
      const refused = spotError(state, spot) ?? buildError(state, spec);
      if (refused) return no(refused);
      build(state, spot, spec, events);
      return;
    }
    case 'original.upgrade': {
      const tower = towerById(state, intArg(command, 'tower'));
      const to = stringArg(command, 'to');
      if (to === null) return no('upgrade needs the tower to become');
      const refused = upgradeError(state, tower, to);
      if (refused || !tower) return no(refused ?? 'no such tower');
      upgrade(state, tower, to, events);
      return;
    }
    case 'original.sell': {
      const tower = towerById(state, intArg(command, 'tower'));
      if (!tower || !orState(state).towers[String(tower.id)]) return no('no such tower');
      sell(state, tower, events);
      return;
    }
    case 'original.target': {
      const tower = towerById(state, intArg(command, 'tower'));
      const targeting = stringArg(command, 'targeting');
      if (!isTargeting(targeting)) return no('targeting is first, last, strong or close');
      const refused = targetingError(tower);
      if (refused || !tower) return no(refused ?? 'no such tower');
      setTargeting(state, tower, targeting, events);
      return;
    }
    case 'original.sendNow': {
      const refused = sendNowError(state);
      if (refused) return no(refused);
      startNextWave(state, events);
      return;
    }
  }
}

/** Why the next Wave can't be sent now, or null: Wave 1 waits for it, and later Waves come during a Break. */
export function sendNowError(state: GameState): string | null {
  const es = orState(state);
  if (state.phase === 'won' || state.phase === 'lost') return 'the Run is over';
  if (state.wave.number >= state.wave.total) return 'no Wave left to send';
  if (state.wave.number > 0 && es.breakUntil < 0) return 'the Wave is still arriving';
  return null;
}

/** The Break before the next Wave begins: the Wave's last creep has just spawned. */
function startBreak(state: State, wave: number, events: SimEvent[]): void {
  const es = state.mode;
  es.breakAfter = wave;
  es.breaks++;
  if (wave >= state.wave.total) return;
  es.breakTicks = ticks(BREAK_SECONDS);
  es.breakUntil = state.tick + es.breakTicks;
  modeEvent(events, 'original.break', { wave: wave + 1, ticks: es.breakTicks, until: es.breakUntil });
}

function isOriginalCommand(type: string): type is OriginalCommand['type'] {
  return (ORIGINAL_COMMANDS as readonly string[]).includes(type);
}

export const ORIGINAL_RULES: GameModeRules<OriginalState> = {
  id: ORIGINAL_MODE_ID,
  towers: ORIGINAL_TOWERS,
  creeps: ORIGINAL_CREEPS,
  // Original damage goes through combat.ts's deal(), never the core's table.
  damageTable: {},
  overlapWaves: true,
  waveFor: (index, state) => waveSpec(state, index),
  setup(state, opts) {
    const options = originalOptions(opts);
    const stage = stageByNumber(options.stage)!;
    setMap(state, typeof opts.map === 'object' ? opts.map : stage.map);
    state.gold = options.gold ?? stage.gold;
    state.lives = START_LIVES;
    state.mode = newState(options, stage.threat);
    state.wave.total = (options.waves ?? stage.waves).length;
  },
  handleCommand(state, command, events) {
    if (!isOriginalCommand(command.type)) return false;
    handle(state, command, events);
    return true;
  },
  // The core's startWave works like original.sendNow.
  canStartWave: (state) => sendNowError(state),
  onTick(state, events) {
    const sim = makeSim(state, events);
    pruneCreeps(state);
    runCreepBehaviour(sim);
    runClouds(sim);
    runAuras(sim);
    runTimedPerks(sim);
    const es = state.mode;
    if (es.breakUntil >= 0 && state.tick >= es.breakUntil) startNextWave(state, events);
  },
  onWaveStart(state, wave, events) {
    const es = state.mode;
    // An early call: the seconds of Break skipped pay gold at the called Wave's Threat.
    if (es.breakUntil >= 0 && state.tick < es.breakUntil) {
      const gold = earlyCallGold(threatOf(state, wave), (es.breakUntil - state.tick) / TICK_RATE);
      earnGold(state, gold, events);
      es.earlyGold += gold;
      modeEvent(events, 'original.earlyCall', { wave, gold });
    }
    es.breakUntil = -1;
    if (wave === 1) es.startTick = state.tick;
  },
  onSpawn(state, creep, events) {
    initCreep(state, creep);
    const es = state.mode;
    if (creep.wave !== state.wave.number || creep.wave <= es.breakAfter) return;
    const active = state.wave.active.find((w) => w.number === creep.wave);
    if (active && active.groups.every((g) => g.spawned >= g.count)) startBreak(state, creep.wave, events);
  },
  onWaveEnd(state, wave, events) {
    const es = state.mode;
    const bonus = waveBonus(threatOf(state, wave));
    earnGold(state, bonus, events);
    es.completed++;
    if (es.completed >= state.wave.total) es.endTick = state.tick;
    modeEvent(events, 'original.cleared', { wave, bonus });
  },
  onLeak(state, creep) {
    const es = state.mode;
    es.leaks++;
    delete es.creeps[String(creep.id)];
    return { lives: creepSpec(creep.spec)?.leakCost ?? 1, then: 'remove' };
  },
  towerTarget: (state, tower, range) => pickTarget(state, tower, range),
  towerBonus: (state, tower) => towerBonus(state, tower),
};

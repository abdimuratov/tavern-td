import {
  ELEMENT_CREEPS, ELEMENT_MAP, FREE_ELEMENTS, FULL_WAVES, START, START_LIVES,
  type HasteHit, type Picks, type RunLength,
} from '../../../content/element';
import { intArg, reject, stringArg, type Command } from '../../core/commands';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { GameModeRules, RunOptions } from '../../core/mode';
import type { Creep, Difficulty, GameState, Tower } from '../../core/state';
import { startNextWave } from '../../core/waves';
import { setMap } from '../../path/grid';
import { runTimers, runTornadoes, runTowerAbilities } from './abilities';
import { build, buildError, sell, sellError, spotError, towerById, upgrade, upgradeError } from './build';
import { creepsInArea, distance2, leakLives, liveCreep, targetable } from './combat';
import { initCreep, pruneCreeps, runCreepTraits } from './creeps';
import { applyDraw, buyEssence, drawOrder, essenceError, isElement, summon, summonError } from './elements';
import {
  ELEMENT_MODE_ID, ELEMENT_RULE_TOWERS, creepSpec, elState, makeSim, modeEvent, newLevels, peekTower, towerInfoOf,
  type ElementState,
} from './state';
import {
  breakSeconds, clearInterestLock, pauseInterest, runInterest, scoreWaveClear, startBreak, startInterest, waveSpec,
  waveTotal,
} from './waves';

// The Element Game Mode: Element TD (MNoya/Element-TD, port 1.18) as Tavern TD
// rules. Commands are `element.*`; each checks its arguments and the moment, and
// on refusal emits `rejected` with a short reason a player can read.

/** Element's commands. Tower arguments are tower ids; (col, row) is the 2 × 2 footprint's top-left cell. */
export type ElementCommand =
  /** Build a tower from nothing: Arrow, Cannon, a level-1 single, or the Periodic tower. */
  | { readonly type: 'element.build'; readonly spec: string; readonly col: number; readonly row: number }
  /** Upgrade a tower into one of its `upgrades`. */
  | { readonly type: 'element.upgrade'; readonly tower: number; readonly to: string }
  | { readonly type: 'element.sell'; readonly tower: number }
  /** Spend a Lumber on an Element: its level at once, or an Elemental to kill for it. All Pick only. */
  | { readonly type: 'element.summon'; readonly element: string }
  /** Spend a Lumber on a Pure Essence. All Pick only. */
  | { readonly type: 'element.buyEssence' }
  /** End the break now; the next Wave starts at once and pays no bonus. */
  | { readonly type: 'element.sendNow' };

export const ELEMENT_COMMANDS: readonly ElementCommand['type'][] = [
  'element.build', 'element.upgrade', 'element.sell', 'element.summon', 'element.buyEssence', 'element.sendNow',
];

/** Element's Run options, in RunOptions.options. */
export interface ElementOptions {
  readonly picks: Picks;
  readonly length: RunLength;
}

export const DEFAULT_OPTIONS: ElementOptions = { picks: 'allPick', length: 'full' };

/** The Run options with defaults filled in; throws on a value it doesn't know. */
export function elementOptions(opts: RunOptions): ElementOptions {
  const o = opts.options ?? {};
  const picks = o['picks'] ?? DEFAULT_OPTIONS.picks;
  const length = o['length'] ?? DEFAULT_OPTIONS.length;
  if (picks !== 'allPick' && picks !== 'allRandom') throw new Error(`Element: picks must be allPick or allRandom, not ${String(picks)}`);
  if (length !== 'full' && length !== 'express') throw new Error(`Element: length must be full or express, not ${String(length)}`);
  return { picks, length };
}

function newState(opts: ElementOptions): ElementState {
  const start = START[opts.length];
  return {
    picks: opts.picks,
    length: opts.length,
    lumber: start.lumber,
    essence: 0,
    essenceBought: 0,
    freeElements: opts.picks === 'allPick' && opts.length === 'full' ? FREE_ELEMENTS : 0,
    levels: newLevels(),
    draws: [],
    breakUntil: -1,
    breakTicks: 0,
    completed: 0,
    interest: { next: -1, left: -1, locks: [], stopped: false },
    waveLeaks: 0,
    score: 0,
    firstSpawn: -1,
    clearTick: -1,
    bossKills: 0,
    lifePoints: 0,
    towers: {},
    creeps: {},
    timers: [],
    tornadoes: [],
  };
}

type State = GameState<ElementState>;

function handle(state: State, command: Command, events: SimEvent[]): void {
  const no = (reason: string): void => reject(events, command, reason);
  switch (command.type as ElementCommand['type']) {
    case 'element.build': {
      const spec = stringArg(command, 'spec');
      const col = intArg(command, 'col');
      const row = intArg(command, 'row');
      if (spec === null || col === null || row === null) return no('build needs spec, col and row');
      const refused = buildError(state, spec) ?? spotError(state, col, row);
      if (refused) return no(refused);
      build(state, spec, col, row, events);
      return;
    }
    case 'element.upgrade': {
      const tower = towerById(state, intArg(command, 'tower'));
      const to = stringArg(command, 'to');
      if (to === null) return no('upgrade needs the tower to become');
      const refused = upgradeError(state, tower, to);
      if (refused || !tower) return no(refused ?? 'no such tower');
      upgrade(state, tower, to, events);
      return;
    }
    case 'element.sell': {
      const tower = towerById(state, intArg(command, 'tower'));
      const refused = sellError(state, tower);
      if (refused || !tower) return no(refused ?? 'no such tower');
      sell(state, tower, events);
      return;
    }
    case 'element.summon': {
      const element = stringArg(command, 'element');
      if (!isElement(element)) return no('summon needs an Element: water, fire, nature, earth, light or dark');
      const refused = summonError(state, element);
      if (refused) return no(refused);
      summon(state, element, events);
      return;
    }
    case 'element.buyEssence': {
      const refused = essenceError(state);
      if (refused) return no(refused);
      buyEssence(state, events);
      return;
    }
    case 'element.sendNow': {
      const refused = sendNowError(state);
      if (refused) return no(refused);
      startNextWave(state, events);
      return;
    }
  }
}

/** Why the break can't be cut short now, or null. */
export function sendNowError(state: GameState): string | null {
  if (state.phase === 'wave') return 'a Wave is still running';
  if (state.phase !== 'build' || state.wave.number >= state.wave.total) return 'no Wave left to send';
  return null;
}

function isElementCommand(type: string): type is ElementCommand['type'] {
  return (ELEMENT_COMMANDS as readonly string[]).includes(type);
}

/**
 * The creep a ready tower attacks (TowersManager.lua): re-picked every attack
 * unless the family keeps its target; never a creep lying dead or shielded.
 * Ties go to the closer creep (the port scans closest first), then the older.
 */
function pickTarget(state: GameState, tower: Tower, range: number): Creep | null {
  const info = towerInfoOf(tower.spec);
  if (!info) return null;
  const r2 = range * range;
  if (info.keepTarget && tower.target !== 0) {
    const current = liveCreep(state, tower.target);
    if (current && targetable(current) && distance2(current.x, current.y, tower.x, tower.y) <= r2) return current;
  }
  let best: Creep | null = null;
  let bestD = 0;
  for (const c of creepsInArea(state, tower.x, tower.y, range)) {
    const d = distance2(c.x, c.y, tower.x, tower.y);
    if (best === null) {
      best = c;
      bestD = d;
      continue;
    }
    const better = info.target === 'closest' ? d < bestD
      : info.target === 'farthest' ? d > bestD
        : info.target === 'highestHp' ? c.hp > best.hp || (c.hp === best.hp && d < bestD)
          : c.hp < best.hp || (c.hp === best.hp && d < bestD);
    if (better) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export const ELEMENT_RULES: GameModeRules<ElementState> = {
  id: ELEMENT_MODE_ID,
  towers: ELEMENT_RULE_TOWERS,
  creeps: ELEMENT_CREEPS,
  // Element damage never goes through the core's table (every attack is direct: false); this is for completeness.
  damageTable: {},
  // Wave HP comes from the tables, Difficulty included.
  difficultyHp: { easy: 1, normal: 1, hard: 1, insane: 1 } satisfies Record<Difficulty, number>,
  waveFor: (index, state) => waveSpec(state, index),
  setup(state, opts) {
    const options = elementOptions(opts);
    setMap(state, typeof opts.map === 'object' ? opts.map : ELEMENT_MAP);
    state.gold = START[options.length].gold;
    state.lives = START_LIVES;
    state.wave.total = waveTotal(options.length);
    const es = newState(options);
    state.mode = es;
    if (options.picks === 'allRandom') {
      es.draws = drawOrder(state.rng, options.length);
      for (const d of es.draws) if (d.after === 0) applyDraw(state, d, [], true);
    }
    const ticks = Math.round(breakSeconds(state, 1) * TICK_RATE);
    es.breakTicks = ticks;
    es.breakUntil = ticks;
  },
  handleCommand(state, command, events) {
    if (!isElementCommand(command.type)) return false;
    handle(state, command, events);
    return true;
  },
  // The core's startWave works like element.sendNow.
  canStartWave: (state) => sendNowError(state),
  onTick(state, events) {
    const sim = makeSim(state, events);
    pruneCreeps(state);
    runInterest(state, events);
    runCreepTraits(sim);
    runTimers(sim);
    runTornadoes(sim);
    runTowerAbilities(sim);
    const es = elState(state);
    if (state.phase === 'build' && es.breakUntil >= 0 && state.tick >= es.breakUntil) startNextWave(state, events);
  },
  onWaveStart(state) {
    const es = elState(state);
    es.breakUntil = -1;
    es.waveLeaks = 0;
    es.bossKills = 0;
  },
  onWaveEnd(state, wave, events) {
    const es = elState(state);
    es.completed = wave;
    clearInterestLock(state, wave);
    scoreWaveClear(state, wave);
    modeEvent(events, 'element.cleared', { wave, score: es.score, leaks: es.waveLeaks });
    if (wave < state.wave.total) startBreak(state, wave, events);
  },
  onSpawn(state, creep) {
    initCreep(state, creep);
    const es = elState(state);
    if (creep.wave === 1 && es.firstSpawn < 0) {
      es.firstSpawn = state.tick;
      startInterest(state);
    }
  },
  onLeak(state, creep) {
    const es = elState(state);
    const elemental = creepSpec(creep.spec)?.elemental !== undefined;
    if (!elemental && creep.wave > 0) {
      es.waveLeaks++;
      pauseInterest(state, creep.wave);
    }
    return { lives: leakLives(creep, es.length === 'full' && creep.wave > FULL_WAVES), then: 'restart' };
  },
  towerTarget: (state, tower, range) => pickTarget(state, tower, range),
  towerCooldown(state, tower) {
    const info = towerInfoOf(tower.spec);
    if (info?.family !== 'haste') return null;
    const hit = ELEMENT_RULE_TOWERS[tower.spec]?.attack?.effects?.[0] as HasteHit | undefined;
    // HasteTower.lua: each stack takes 0.03 s off the base attack time.
    return info.cooldown - (hit?.step ?? 0) * peekTower(state, tower).stacks;
  },
};

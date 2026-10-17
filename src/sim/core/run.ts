import { getMode } from '../modes/registry';
import { SNAPSHOT_VERSION } from './constants';
import type { RunOptions } from './mode';
import { createRng } from './rng';
import type { MapSpec } from './specs';
import { DIFFICULTIES, type GameState } from './state';

/** Placeholder until the Game Mode's setup installs its Map. */
const NO_MAP: MapSpec = { id: '', cols: 0, rows: 0, terrain: [], spawn: [0, 0], waypoints: [] };

/** Builds a Run's initial state through the Game Mode's setup. Throws on an unknown mode or a setup bug. */
export function createRun(opts: RunOptions): GameState {
  const rules = getMode(opts.mode);
  if (!DIFFICULTIES.includes(opts.difficulty)) throw new Error(`Unknown Difficulty: ${String(opts.difficulty)}`);
  const seed = opts.seed >>> 0;
  const state: GameState = {
    v: SNAPSHOT_VERSION,
    modeId: rules.id,
    seed,
    difficulty: opts.difficulty,
    tick: 0,
    phase: 'build',
    rng: createRng(seed),
    nextId: 1,
    gold: 0,
    lives: 0,
    map: NO_MAP,
    grid: [],
    pathVersion: 0,
    wave: { number: 0, total: rules.waves?.length ?? 0, active: [] },
    creeps: [],
    towers: [],
    projectiles: [],
    mode: null,
  };
  rules.setup(state, opts);
  if (state.map === NO_MAP) throw new Error(`Game Mode ${rules.id}: setup must call setMap`);
  return state;
}

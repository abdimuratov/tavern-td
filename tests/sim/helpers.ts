import '../../src/sim/testing';
import {
  addTower, cellOf, createRun, spawnCreep, step,
  type Cell, type Command, type Creep, type GameState, type MapSpec, type RunOptions, type SimEvent, type Tower,
} from '../../src/sim';
import type { TestModeState } from '../../src/sim/testing';

export type TestState = GameState<TestModeState>;

export function newRun(opts: Partial<RunOptions> = {}): TestState {
  return createRun({ mode: 'test', seed: 1, difficulty: 'normal', ...opts }) as TestState;
}

/** Steps `ticks` times, `first` applied on the first, and returns every event. */
export function run(state: GameState, ticks: number, first: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(state, i === 0 ? first : []));
  return events;
}

/** Steps until `done` holds (checked after each step) or `max` ticks pass. */
export function runUntil(state: GameState, done: (events: readonly SimEvent[]) => boolean, max = 10_000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    const events = step(state, []);
    all.push(...events);
    if (done(events)) return all;
  }
  throw new Error(`condition not met within ${max} ticks`);
}

export function ofType<T extends SimEvent['type']>(events: readonly SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/**
 * An all-buildable Map; spawn and waypoint cells are walkable but unbuildable
 * and `walls` are unwalkable.
 */
export function openMap(cols: number, rows: number, spawn: Cell, waypoints: Cell[][], walls: Cell[] = []): MapSpec {
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '.'));
  for (const [c, r] of [spawn, ...waypoints.flat()]) grid[r]![c] = ',';
  for (const [c, r] of walls) grid[r]![c] = '#';
  return { id: `open-${cols}x${rows}`, cols, rows, terrain: grid.map((row) => row.join('')), spawn, waypoints };
}

/** A stationary creep at a world position, outside any Wave. */
export function creepAt(state: GameState, spec: string, x: number, y: number, hp?: number): Creep {
  const c = spawnCreep(state, spec, hp === undefined ? { speed: 0 } : { speed: 0, hp }, []);
  c.x = x;
  c.y = y;
  return c;
}

export function towerAt(state: GameState, spec: string, col: number, row: number): Tower {
  return addTower(state, spec, cellOf(state.map, col, row), []);
}

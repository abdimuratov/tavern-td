import type { MaulWave, RaceId } from '../../../src/content/maul';
import {
  addTower, cellOf, createRun, maul, spawnCreep, step,
  type Command, type Creep, type Difficulty, type GameState, type MapSpec, type SimEvent, type Tower,
} from '../../../src/sim';

export type MaulRun = maul.MaulGameState;

export interface RunSetup {
  readonly seed?: number;
  readonly difficulty?: Difficulty;
  readonly race?: RaceId;
  readonly waves?: readonly MaulWave[];
  readonly gold?: number;
  readonly map?: MapSpec;
}

export function newRun(o: RunSetup = {}): MaulRun {
  const options: Record<string, unknown> = { race: o.race ?? 'ironclad' };
  if (o.waves) options['waves'] = JSON.parse(JSON.stringify(o.waves));
  if (o.gold !== undefined) options['gold'] = o.gold;
  return createRun({
    mode: 'maul', seed: o.seed ?? 1, difficulty: o.difficulty ?? 'normal', options: options as never, ...(o.map ? { map: o.map } : {}),
  }) as MaulRun;
}

/** One tick with these commands. */
export function send(state: GameState, ...commands: Command[]): SimEvent[] {
  return step(state, commands);
}

/** Steps `ticks` times and returns every event. */
export function run(state: GameState, ticks: number, first: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(state, i === 0 ? first : []));
  return events;
}

/** Steps until the condition holds or `max` ticks pass; returns every event. */
export function runUntil(state: GameState, done: () => boolean, max = 30 * 600): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && !done(); i++) all.push(...step(state, []));
  return all;
}

export function ofType<T extends SimEvent['type']>(events: readonly SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

export function reasons(events: readonly SimEvent[]): string[] {
  return ofType(events, 'rejected').map((e) => e.reason);
}

export function modeEvents(events: readonly SimEvent[], name: string): Extract<SimEvent, { type: 'mode' }>[] {
  return ofType(events, 'mode').filter((e) => e.name === name);
}

export function towerOf(state: GameState, id: number): Tower {
  const t = state.towers.find((x) => x.id === id);
  if (!t) throw new Error(`no tower ${id}`);
  return t;
}

/** Builds `spec` with its top-left at (col, row) through the command and returns it; throws if refused. */
export function buildAt(state: MaulRun, spec: string, col: number, row: number): Tower {
  const events = send(state, { type: 'maul.build', spec, col, row });
  const refused = reasons(events);
  if (refused.length > 0) throw new Error(`build ${spec} refused: ${refused.join(', ')}`);
  return towerOf(state, ofType(events, 'placed')[0]!.tower);
}

/** Stands any tower (forks included) at (col, row), outside the build rules and free. */
export function placeTower(state: MaulRun, spec: string, col: number, row: number): Tower {
  const tower = addTower(state, spec, cellOf(state.map, col, row), []);
  state.mode.towers[String(tower.id)] = { paid: 0, fresh: 0 };
  return tower;
}

/** A creep standing still at a world position, outside any Wave. */
export function creepAt(state: GameState, spec: string, x: number, y: number, hp?: number): Creep {
  const c = spawnCreep(state, spec, { wave: 0, speed: 0, ...(hp === undefined ? {} : { hp }) }, []);
  c.x = x;
  c.y = y;
  return c;
}

/**
 * A plain test field: 24 × 12 open ground, one spawn at the west end of row 5
 * and the exit at the east end, no checkpoints.
 */
export function field(cols = 24, rows = 12): MapSpec {
  const terrain = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (
    (c === 0 || c === cols - 1) && (r === 5 || r === 6) ? ',' : '.'
  )).join(''));
  return { id: `field-${cols}x${rows}`, cols, rows, terrain, spawn: [0, 5], waypoints: [[[cols - 1, 5], [cols - 1, 6]]] };
}

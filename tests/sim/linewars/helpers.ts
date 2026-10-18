import { FIELD_COLS, FIELD_WIDTH, fieldSpawns, type SkillId } from '../../../src/content/linewars';
import type { RaceId } from '../../../src/content/maul';
import {
  CELL, addTower, cellOf, createRun, linewars, spawnCreep, step,
  type Command, type Creep, type Difficulty, type GameState, type SimEvent, type Tower,
} from '../../../src/sim';

export type LwRun = linewars.LwGameState;
export type Side = linewars.SideId;

export interface RunSetup {
  readonly seed?: number;
  readonly difficulty?: Difficulty;
  readonly race?: RaceId;
  readonly rivalRace?: RaceId | 'random';
  /** Both human by default, so a test drives every move; ['human', 'ai'] is the real Run. */
  readonly drivers?: readonly ['human' | 'ai', 'human' | 'ai'];
  readonly skills?: readonly [SkillId | null, SkillId | null];
  readonly gold?: number;
  readonly lives?: number;
}

export function newRun(o: RunSetup = {}): LwRun {
  const options: Record<string, unknown> = {
    race: o.race ?? 'ironclad', rivalRace: o.rivalRace ?? 'rimeborn', drivers: [...(o.drivers ?? ['human', 'human'])],
  };
  if (o.skills) options['skills'] = [...o.skills];
  if (o.gold !== undefined) options['gold'] = o.gold;
  if (o.lives !== undefined) options['lives'] = o.lives;
  return createRun({ mode: 'linewars', seed: o.seed ?? 1, difficulty: o.difficulty ?? 'normal', options: options as never }) as LwRun;
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

/** Steps until the state's tick is `tick` (the next step will be that tick's). */
export function runTo(state: GameState, tick: number): SimEvent[] {
  return run(state, Math.max(0, tick - state.tick));
}

/** Steps until the condition holds or `max` ticks pass; returns every event. */
export function runUntil(state: GameState, done: () => boolean, max = 30 * 60 * 20): SimEvent[] {
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

/** A Field's Map column from its own west-to-east column 0–15. */
export function col(side: Side, c: number): number {
  return FIELD_COLS[side][0] + c;
}

/** Builds `spec` for `side` with its top-left at (col, row) through the command and returns it; throws if refused. */
export function buildAt(state: LwRun, side: Side, spec: string, c: number, row: number): Tower {
  const events = send(state, { type: 'lw.build', side, spec, col: c, row });
  const refused = reasons(events);
  if (refused.length > 0) throw new Error(`build ${spec} refused: ${refused.join(', ')}`);
  return towerOf(state, ofType(events, 'placed')[0]!.tower);
}

/** Stands any tower (forks included) at (col, row), outside the build rules and free. */
export function placeTower(state: LwRun, spec: string, c: number, row: number): Tower {
  const tower = addTower(state, spec, cellOf(state.map, c, row), []);
  state.mode.towers[String(tower.id)] = 0;
  return tower;
}

/** A creep of `spec` in `field`'s Field, standing still at a world position unless `speed` says otherwise. */
export function creepIn(state: GameState, field: Side, spec: string, x: number, y: number, o: { hp?: number; speed?: number } = {}): Creep {
  const [first] = fieldSpawns(field);
  const c = spawnCreep(state, spec, { speed: o.speed ?? 0, spawn: first, ...(o.hp === undefined ? {} : { hp: o.hp }) }, []);
  c.x = x;
  c.y = y;
  return c;
}

/** The world centre of cell (col, row). */
export function at(c: number, row: number): { x: number; y: number } {
  return { x: (c + 0.5) * CELL, y: (row + 0.5) * CELL };
}

/** Gold, lives, income and live creeps of both Sides. */
export function purse(state: LwRun): { gold: [number, number]; lives: [number, number]; income: [number, number]; live: [number, number] } {
  const [a, b] = state.mode.sides;
  return { gold: [a.gold, b.gold], lives: [a.lives, b.lives], income: [a.income, b.income], live: [a.live, b.live] };
}

export const WIDTH = FIELD_WIDTH;

import { ORIGINAL_TOWERS, type OriginalWave } from '../../../src/content/original';
import {
  addTower, buildSpotCells, createRun, original, placeOnRoute, spawnCreep, step,
  type Command, type Creep, type Difficulty, type GameState, type MapSpec, type SimEvent, type Tower,
} from '../../../src/sim';

export type OriginalRun = original.OriginalGameState;

export interface RunSetup {
  readonly seed?: number;
  readonly difficulty?: Difficulty;
  readonly stage?: number;
  readonly talents?: readonly string[];
  /** Stages finished; everything unlocked (12) by default, so tests can use every tower. */
  readonly cleared?: number;
  readonly waves?: readonly OriginalWave[];
  readonly map?: MapSpec;
}

export function newRun(o: RunSetup = {}): OriginalRun {
  const options: Record<string, unknown> = { stage: o.stage ?? 1, talents: [...(o.talents ?? [])], cleared: o.cleared ?? 12 };
  if (o.waves) options['waves'] = JSON.parse(JSON.stringify(o.waves));
  return createRun({
    mode: 'original', seed: o.seed ?? 1, difficulty: o.difficulty ?? 'normal',
    options: options as never, ...(o.map ? { map: o.map } : {}),
  }) as OriginalRun;
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

/** Builds `spec` on Build Spot `spot` through the command and returns the tower; throws if refused. */
export function buildOn(state: OriginalRun, spot: number, spec: string): Tower {
  const events = send(state, { type: 'original.build', spot, spec });
  const refused = reasons(events);
  if (refused.length > 0) throw new Error(`build ${spec} refused: ${refused.join(', ')}`);
  return towerOf(state, ofType(events, 'placed')[0]!.tower);
}

/** Stands any tower (upgrades included) on Build Spot `spot`, outside the build rules and free. */
export function placeTower(state: OriginalRun, spot: number, spec: string): Tower {
  const tower = addTower(state, spec, buildSpotCells(state.map, spot)[0]!, []);
  state.mode.towers[String(tower.id)] = original.newTowerState(ORIGINAL_TOWERS[spec]!.original.targeting, state.mode.breaks);
  return tower;
}

/** Stands a tower at an exact world position (its centre), outside the build rules. */
export function towerAtPoint(state: OriginalRun, spec: string, x: number, y: number): Tower {
  const tower = addTower(state, spec, 0, []);
  for (const c of tower.cells) state.grid[c] = 0;
  tower.cells = [];
  tower.x = x;
  tower.y = y;
  state.mode.towers[String(tower.id)] = original.newTowerState(ORIGINAL_TOWERS[spec]!.original.targeting, state.mode.breaks);
  return tower;
}

/** A creep of `spec` standing still `dist` along route `route`, outside any Wave. */
export function creepOnRoute(state: OriginalRun, spec: string, dist: number, hp?: number, route = 0): Creep {
  const c = spawnCreep(state, spec, { wave: 0, route, ...(hp === undefined ? {} : { hp }) }, []);
  placeOnRoute(state, c, dist);
  c.speed = 0;
  return c;
}

/**
 * A creep at a world position, outside any Wave, for questions asked before
 * the next step: a creep on a route or air line snaps back to its line when it moves.
 */
export function creepAt(state: OriginalRun, spec: string, x: number, y: number, hp?: number): Creep {
  const c = spawnCreep(state, spec, { wave: 0, ...(hp === undefined ? {} : { hp }) }, []);
  c.x = x;
  c.y = y;
  c.speed = 0;
  return c;
}

/** Hits a creep through the Original's damage model, as tower `tower` would. */
export function hit(state: OriginalRun, creep: Creep, amount: number, type: 'pierce' | 'siege' | 'magic' | 'poison', tower = 0, spec: string | null = null): SimEvent[] {
  const events: SimEvent[] = [];
  const sim = { state, rules: original.ORIGINAL_RULES as never, events };
  original.deal(sim, creep, amount, type, tower, 'attack', 1, spec);
  return events;
}

/** Sets a tower's XP and Tower Level directly. */
export function setLevel(state: OriginalRun, tower: Tower, level: number): void {
  const ts = state.mode.towers[String(tower.id)]!;
  ts.level = level;
  ts.xp = [0, 8, 20, 36, 56, 80, 108, 140, 176, 216][level - 1]!;
}

/** Steps until the condition holds or `max` ticks pass; returns every event. */
export function runUntil(state: GameState, done: () => boolean, max = 30 * 600): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && !done(); i++) all.push(...step(state, []));
  return all;
}

/**
 * A straight test Map: two routes along rows (each 2 cells wide) from the left
 * edge to the right, with Build Spots between them and air lines that cross.
 */
export const TWO_ROUTES: MapSpec = (() => {
  const terrain = Array.from({ length: 18 }, () => '#'.repeat(32).split(''));
  for (const r of [2, 3, 14, 15]) for (let c = 0; c < 32; c++) terrain[r]![c] = ',';
  const spots: [number, number][] = [[4, 7], [8, 7], [12, 7], [16, 7], [20, 7], [24, 7]];
  for (const [c, r] of spots) for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) terrain[r + dr]![c + dc] = '.';
  return {
    id: 'two-routes',
    cols: 32,
    rows: 18,
    terrain: terrain.map((row) => row.join('')),
    spawn: [0, 3],
    waypoints: [[[31, 3], [31, 15]]],
    routes: [
      { points: [[0, 192], [2048, 192]], air: [[0, 192], [1024, 576], [2048, 960]] },
      { points: [[0, 960], [2048, 960]], air: [[0, 960], [2048, 192]] },
    ],
    buildSpots: spots,
  };
})();

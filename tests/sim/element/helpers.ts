import {
  addTower, cellOf, createRun, element, placeOnRoute, spawnCreep, step,
  type Command, type Creep, type Difficulty, type GameState, type SimEvent, type Tower,
} from '../../../src/sim';

export type ElementRun = element.ElementGameState;

export interface RunSetup {
  readonly seed?: number;
  readonly difficulty?: Difficulty;
  readonly picks?: 'allPick' | 'allRandom';
  readonly length?: 'full' | 'express';
}

export function newElementRun(o: RunSetup = {}): ElementRun {
  return createRun({
    mode: 'element', seed: o.seed ?? 1, difficulty: o.difficulty ?? 'normal',
    options: { picks: o.picks ?? 'allPick', length: o.length ?? 'full' },
  }) as ElementRun;
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

/** Steps until the Wave in progress ends (or the Run does). */
export function finishWave(state: GameState, max = 30 * 900): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && state.phase === 'wave'; i++) all.push(...step(state, []));
  return all;
}

/** Steps through the break until the next Wave starts. */
export function finishBreak(state: GameState, max = 30 * 120): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && state.phase === 'build'; i++) all.push(...step(state, []));
  return all;
}

export function towerOf(state: GameState, id: number): Tower {
  const t = state.towers.find((x) => x.id === id);
  if (!t) throw new Error(`no tower ${id}`);
  return t;
}

/** Builds `spec` at (col, row) and returns the tower; throws if refused. */
export function buildAt(state: ElementRun, spec: string, col: number, row: number): Tower {
  const events = send(state, { type: 'element.build', spec, col, row });
  const refused = reasons(events);
  if (refused.length > 0) throw new Error(`build ${spec} refused: ${refused.join(', ')}`);
  return towerOf(state, ofType(events, 'placed')[0]!.tower);
}

/** Makes a tower fully built at once. */
export function finishBuilding(state: ElementRun, tower: Tower): void {
  state.mode.towers[String(tower.id)]!.ready = state.tick;
  tower.cd = 0;
}

/** Raises Element levels directly, for tests that need towers unlocked. */
export function setLevels(state: ElementRun, levels: Partial<Record<'water' | 'fire' | 'nature' | 'earth' | 'light' | 'dark', number>>): void {
  Object.assign(state.mode.levels, levels);
}

/** A creep of `spec` standing still `dist` along the route, outside any Wave. */
export function creepOnRoute(state: ElementRun, spec: string, dist: number, hp?: number): Creep {
  const c = spawnCreep(state, spec, hp === undefined ? { wave: 0 } : { wave: 0, hp }, []);
  placeOnRoute(state, c, dist);
  c.speed = 0;
  return c;
}

/** Plot anchors for 2 × 2 towers: the long plot between corners 3–4 and 7–8, then the inner plots. */
export const PLOT_SPOTS: readonly (readonly [number, number])[] = [
  [17, 6], [19, 6], [21, 6], [23, 6], [25, 6], [27, 6], [29, 6], [31, 6], [33, 6], [35, 6], [37, 6], [39, 6], [41, 6], [43, 6], [45, 6], [47, 6],
  [17, 8], [19, 8], [21, 8], [23, 8], [25, 8], [27, 8], [29, 8], [31, 8], [33, 8], [35, 8], [37, 8], [39, 8], [41, 8], [43, 8], [45, 8], [47, 8],
];

/**
 * Plays the next Wave out at once: ends the break, then removes each creep as
 * it spawns (no bounty), so tests can reach later Waves quickly.
 */
export function skipWave(state: ElementRun): SimEvent[] {
  const all: SimEvent[] = [];
  if (state.phase === 'build') all.push(...send(state, { type: 'element.sendNow' }));
  for (let i = 0; i < 30 * 120 && state.phase === 'wave'; i++) {
    all.push(...step(state, []));
    for (const c of state.creeps) if (c.wave > 0) c.hp = 0;
  }
  return all;
}

/** Kills a creep the way a tower hit would, through Element's damage model. */
export function hitCreep(state: ElementRun, creep: Creep, damage: number, tower = 0, elem: 'composite' | 'water' | 'fire' | 'nature' | 'earth' | 'light' | 'dark' = 'composite'): SimEvent[] {
  const events: SimEvent[] = [];
  element.dealDamage(state, creep, damage, tower, elem, events);
  return events;
}

/** Stands any tower (upgrades included) at (col, row), fully built, outside the build rules. */
export function placeTower(state: ElementRun, spec: string, col: number, row: number): Tower {
  const tower = addTower(state, spec, cellOf(state.map, col, row), []);
  state.mode.towers[String(tower.id)] = element.newTowerState(state.tick);
  return tower;
}

/** A creep standing on the lane's top run (y = 128) at world x. */
export function onTopLane(state: ElementRun, spec: string, x: number, hp?: number): Creep {
  return creepOnRoute(state, spec, 9900 + (3520 - x), hp);
}

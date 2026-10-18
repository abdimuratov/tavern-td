import { describe, expect, it } from 'vitest';
import {
  airRoute, allRouteCells, cellCol, cellOf, cellRow, hashState, nextCell, pathDistance, placementError, previewAllRoutes, previewRoute,
  removeTower, routeCells, spawnCount, validateMap, wouldBlock,
  type GameState, type MapSpec,
} from '../../src/sim';
import { TEST_MAP } from '../../src/sim/testing';
import { creepAt, newRun, ofType, openMap, run, runUntil, towerAt } from './helpers';

const place = (spec: string, col: number, row: number) => ({ type: 'place', spec, col, row });

function isOpen(s: GameState, col: number, row: number): boolean {
  const cell = cellOf(s.map, col, row);
  return cell >= 0 && s.map.terrain[row]![col] !== '#' && s.grid[cell] === 0;
}

function inRegion(s: GameState, region: number, cell: number): boolean {
  return s.map.waypoints[region]!.some(([c, r]) => cellOf(s.map, c, r) === cell);
}

/** Walks a route, checking every step is a legal 8-way move, and returns its length and the cell where each segment begins. */
function measure(s: GameState, route: number[]): { length: number; entries: number[]; finished: boolean } {
  let seg = 0;
  let length = 0;
  const entries = [route[0]!];
  for (let i = 0; i < route.length; i++) {
    const cell = route[i]!;
    while (seg < s.map.waypoints.length && inRegion(s, seg, cell)) {
      seg++;
      entries.push(cell);
    }
    if (i === 0) continue;
    const prev = route[i - 1]!;
    const [pc, pr, c, r] = [cellCol(s.map, prev), cellRow(s.map, prev), cellCol(s.map, cell), cellRow(s.map, cell)];
    const dc = Math.abs(c - pc);
    const dr = Math.abs(r - pr);
    expect(isOpen(s, c, r)).toBe(true);
    expect(Math.max(dc, dr)).toBe(1);
    if (dc === 1 && dr === 1) {
      expect(isOpen(s, c, pr) && isOpen(s, pc, r)).toBe(true);
      length += Math.SQRT2;
    } else {
      length += 1;
    }
  }
  return { length, entries: entries.slice(0, s.map.waypoints.length), finished: seg === s.map.waypoints.length };
}

/** Each segment of the route is as short as the flow field says the trip from its entry cell can be. */
function expectShortest(s: GameState, route: number[]): void {
  const { length, entries, finished } = measure(s, route);
  expect(finished).toBe(true);
  const shortest = entries.reduce((sum, cell, seg) => sum + pathDistance(s, seg, cell), 0);
  expect(length).toBeCloseTo(shortest, 9);
}

describe('flow fields', () => {
  it('give octile distances to the waypoint region', () => {
    const s = newRun({ map: openMap(5, 4, [0, 0], [[[4, 3]]]) });
    const d = (col: number, row: number) => pathDistance(s, 0, cellOf(s.map, col, row));
    expect(d(4, 3)).toBe(0);
    expect(d(3, 3)).toBe(1);
    expect(d(3, 2)).toBeCloseTo(Math.SQRT2, 12);
    expect(d(0, 3)).toBe(4);
    expect(d(0, 0)).toBeCloseTo(3 * Math.SQRT2 + 1, 12);
  });

  it('route around structures and never cut a corner', () => {
    const s = newRun({ map: openMap(4, 4, [0, 0], [[[3, 3]]]) });
    const cell = (col: number, row: number) => cellOf(s.map, col, row);
    expect(pathDistance(s, 0, cell(2, 2))).toBeCloseTo(Math.SQRT2, 12);
    towerAt(s, 'rock', 3, 2);
    expect(pathDistance(s, 0, cell(2, 2))).toBe(2);
    expect(nextCell(s, 0, cell(2, 2))).toBe(cell(2, 3));
    // The diagonal squeeze between (3,2) and (2,3) is no path.
    expect(wouldBlock(s, [cell(2, 3)])).toBe(true);
    towerAt(s, 'rock', 2, 3);
    expect(pathDistance(s, 0, cell(2, 2))).toBe(Infinity);
  });

  it('rebuild when a structure appears or goes', () => {
    const s = newRun({ map: openMap(5, 2, [0, 0], [[[4, 0]]]) });
    const version = s.pathVersion;
    expect(pathDistance(s, 0, 0)).toBe(4);
    const tower = towerAt(s, 'rock', 2, 0);
    expect(s.pathVersion).toBe(version + 1);
    expect(pathDistance(s, 0, 0)).toBeCloseTo(2 * Math.SQRT2 + 2, 12);
    removeTower(s, tower.id, []);
    expect(s.pathVersion).toBe(version + 2);
    expect(pathDistance(s, 0, 0)).toBe(4);
  });
});

describe('Block check', () => {
  it('rejects a placement that seals the exit', () => {
    const s = newRun({ map: openMap(7, 3, [0, 1], [[[6, 1]]]) });
    const events = run(s, 1, [place('rock', 3, 0), place('rock', 3, 2), place('rock', 3, 1)]);
    expect(ofType(events, 'placed')).toHaveLength(2);
    expect(ofType(events, 'rejected').map((e) => e.reason)).toEqual(['blocks the path']);
    expect(s.grid[cellOf(s.map, 3, 1)]).toBe(0);
  });

  it('rejects sealing off a checkpoint even while the exit stays reachable', () => {
    const s = newRun({ map: openMap(7, 5, [0, 2], [[[6, 0]], [[6, 4]]]) });
    const events = run(s, 1, [place('rock', 5, 0), place('rock', 5, 1), place('rock', 6, 1)]);
    expect(ofType(events, 'rejected').map((e) => e.reason)).toEqual(['blocks the path']);
    expect(placementError(s, [cellOf(s.map, 3, 3)])).toBeNull();
  });

  it('rejects a placement on a ground creep but not under an air creep', () => {
    const s = newRun({ map: openMap(8, 3, [0, 1], [[[7, 1]]]) });
    creepAt(s, 'grunt', 3.5 * 64, 1.5 * 64);
    creepAt(s, 'bat', 5.5 * 64, 1.5 * 64);
    expect(placementError(s, [cellOf(s.map, 3, 1)])).toBe('creep in the way');
    expect(placementError(s, [cellOf(s.map, 5, 1)])).toBeNull();
  });

  it('rejects stranding a live ground creep from its next waypoint', () => {
    const s = newRun({ map: openMap(6, 6, [0, 0], [[[5, 5]]]) });
    creepAt(s, 'grunt', 2.5 * 64, 2.5 * 64);
    for (const [c, r] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3]] as const) towerAt(s, 'rock', c, r);
    const last = cellOf(s.map, 3, 3);
    expect(placementError(s, [last])).toBe('blocks the path');
    s.creeps[0]!.hp = 0;
    expect(placementError(s, [last])).toBeNull();
  });

  it('rejects off-Map, unbuildable and occupied cells', () => {
    const s = newRun();
    expect(placementError(s, [-1])).toBe('out of bounds');
    expect(placementError(s, [cellOf(s.map, 0, 0)])).toBe('unbuildable');
    expect(placementError(s, [cellOf(s.map, 4, 3)])).toBe('unbuildable');
    towerAt(s, 'rock', 6, 6);
    expect(placementError(s, [cellOf(s.map, 6, 6)])).toBe('occupied');
    expect(placementError(s, [cellOf(s.map, 7, 6), cellOf(s.map, 7, 6)])).toBe('occupied');
    expect(ofType(run(s, 1, [{ type: 'place', spec: 'rock', col: 99, row: 0 }]), 'rejected')[0]?.reason).toBe('out of bounds');
  });
});

describe('route', () => {
  it('runs spawn, checkpoints, exit, each segment a shortest path', () => {
    const s = newRun();
    const route = routeCells(s);
    expect(route[0]).toBe(cellOf(s.map, ...TEST_MAP.spawn));
    expectShortest(s, route);
  });

  it('has the analytic length on an open Map', () => {
    const s = newRun({ map: openMap(10, 6, [0, 0], [[[9, 0]], [[0, 5]]]) });
    expect(measure(s, routeCells(s)).length).toBeCloseTo(9 + 5 * Math.SQRT2 + 4, 9);
  });

  it('follows the maze as it changes', () => {
    const s = newRun();
    const blocked = routeCells(s)[5]!;
    run(s, 1, [place('rock', cellCol(s.map, blocked), cellRow(s.map, blocked))]);
    const after = routeCells(s);
    expect(after).not.toContain(blocked);
    expectShortest(s, after);
  });

  it('previews the route a placement would make without touching the state', () => {
    const s = newRun();
    const before = routeCells(s);
    const hash = hashState(s);
    const cell = before[5]!;
    const preview = previewRoute(s, [cell])!;
    expect(preview).not.toContain(cell);
    expectShortest(s, routeCells(s));
    expect(hashState(s)).toBe(hash);
    run(s, 1, [place('rock', cellCol(s.map, cell), cellRow(s.map, cell))]);
    expect(routeCells(s)).toEqual(preview);
    expect(previewRoute(s, [cellOf(s.map, 0, 0)])).toBeNull();
  });
});

/** Spawns in the top corners, one checkpoint between them in the middle, the exit at the bottom centre. */
function twoSpawns(): MapSpec {
  const map = openMap(9, 7, [0, 0], [[[4, 2]], [[4, 6]]]);
  const terrain = map.terrain.map((row, r) => (r === 0 ? `${row.slice(0, 8)},` : row));
  return { ...map, id: 'two-spawns', terrain, spawns: [[0, 0], [8, 0]] };
}

describe('several spawns', () => {
  it('are checked: spawn first, walkable, and never beside routes', () => {
    const map = twoSpawns();
    expect(validateMap(map)).toBeNull();
    expect(spawnCount(map)).toBe(2);
    expect(spawnCount(openMap(3, 3, [0, 0], [[[2, 2]]]))).toBe(1);
    expect(validateMap({ ...map, spawns: [[8, 0], [0, 0]] })).toBe('spawns must list spawn first');
    expect(validateMap({ ...map, spawns: [[0, 0], [9, 0]] })).toBe('every spawn must be a walkable cell on the Map');
    expect(validateMap({ ...map, spawns: [] })).toBe('spawns needs at least one spawn');
    expect(validateMap({ ...map, route: { points: [[0, 0], [64, 0]] } })).toMatch(/no spawns list/);
  });

  it('each start a route through the same checkpoints, and send their creeps in where the Wave group says', () => {
    const waves = [{ groups: [{ creep: 'grunt', count: 1, interval: 1 }, { creep: 'grunt', count: 1, interval: 1, spawn: 1 }, { creep: 'bat', count: 1, interval: 1, spawn: 1 }] }];
    const s = newRun({ map: twoSpawns(), options: { waves } });
    const [west, east] = allRouteCells(s);
    expect(west![0]).toBe(cellOf(s.map, 0, 0));
    expect(east![0]).toBe(cellOf(s.map, 8, 0));
    expect(routeCells(s, 1)).toEqual(east);
    expectShortest(s, west!);
    expectShortest(s, east!);
    expect(airRoute(s, 1)[0]).toEqual({ x: 8.5 * 64, y: 32 });
    const spawned = ofType(run(s, 1, [{ type: 'startWave' }]), 'spawn').map((e) => [e.spec, e.x, e.y]);
    expect(spawned).toEqual([['grunt', 32, 32], ['grunt', 8.5 * 64, 32], ['bat', 8.5 * 64, 32]]);
    expect(s.creeps.map((c) => c.spawn)).toEqual([0, 1, 1]);
  });

  it('are each kept open by the Block check', () => {
    const s = newRun({ map: twoSpawns() });
    // Walling in the east spawn alone leaves the west one free, and is still a Block.
    towerAt(s, 'rock', 7, 0);
    towerAt(s, 'rock', 7, 1);
    expect(placementError(s, [cellOf(s.map, 8, 1)])).toBe('blocks the path');
    expect(previewAllRoutes(s, [cellOf(s.map, 8, 1)])).toBeNull();
    const preview = previewAllRoutes(s, [cellOf(s.map, 3, 2)])!;
    expect(preview).toHaveLength(2);
    expect(previewRoute(s, [cellOf(s.map, 3, 2)], 1)).toEqual(preview[1]);
  });

  it('restart a leaked creep at its own spawn', () => {
    const waves = [{ groups: [{ creep: 'grunt', count: 1, interval: 1, spawn: 1 }] }];
    const s = newRun({ map: twoSpawns(), options: { waves, leak: 'restart' } });
    run(s, 1, [{ type: 'startWave' }]);
    const creep = s.creeps[0]!;
    runUntil(s, (events) => events.some((e) => e.type === 'leak'));
    expect([creep.x, creep.y, creep.seg]).toEqual([8.5 * 64, 32, 0]);
    expect(s.lives).toBe(9);
  });
});

describe('a Checkpoint in several places', () => {
  /** One spawn top-centre, a Checkpoint split between the two bottom corners, the exit right of centre. */
  function corners(): MapSpec {
    return openMap(9, 6, [4, 0], [[[0, 5], [8, 5]], [[5, 0]]]);
  }

  it('sends ground creeps to the nearer place and flyers straight to it', () => {
    const s = newRun({ map: corners() });
    towerAt(s, 'rock', 1, 4);
    towerAt(s, 'rock', 1, 3);
    towerAt(s, 'rock', 2, 4);
    const route = routeCells(s);
    // With the west corner walled in further, the ground route takes the east one.
    expect(route).toContain(cellOf(s.map, 8, 5));
    expect(route).not.toContain(cellOf(s.map, 0, 5));
    const air = airRoute(s);
    // Both corners are as near the spawn as each other: the first listed wins, then the exit.
    expect(air).toEqual([{ x: 4.5 * 64, y: 32 }, { x: 32, y: 5.5 * 64 }, { x: 5.5 * 64, y: 32 }]);
  });

  it('counts as reached at either place', () => {
    const waves = [{ groups: [{ creep: 'bat', count: 1, interval: 1 }] }];
    const s = newRun({ map: corners(), options: { waves } });
    run(s, 1, [{ type: 'startWave' }]);
    const bat = s.creeps[0]!;
    runUntil(s, () => bat.seg === 1);
    // It touched the west corner's centre and has turned for the exit this same tick.
    expect(bat.x).toBeLessThan(64);
    runUntil(s, () => s.lives < 10);
  });
});

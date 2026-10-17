import { describe, expect, it } from 'vitest';
import { airRoute, CELL, cellOf, pathDistance, step, TICK_RATE, type GameState } from '../../src/sim';
import { newRun, ofType, openMap, run } from './helpers';

const one = (creep: string) => ({ options: { waves: [{ groups: [{ creep, count: 1, interval: 0 }] }] } });

function cellUnder(s: GameState, x: number, y: number): number {
  return cellOf(s.map, Math.floor(x / CELL), Math.floor(y / CELL));
}

function inRegion(s: GameState, region: number, cell: number): boolean {
  return s.map.waypoints[region]!.some(([c, r]) => cellOf(s.map, c, r) === cell);
}

describe('ground creeps', () => {
  it('enter the checkpoints in order and leak at the exit', () => {
    const s = newRun(one('grunt'));
    run(s, 1, [{ type: 'startWave' }]);
    const grunt = s.creeps[0]!;
    const entered: number[] = [];
    let seg = 0;
    let leaked = false;
    for (let i = 0; i < 3000 && !leaked; i++) {
      const events = step(s, []);
      if (grunt.seg !== seg) {
        expect(grunt.seg).toBe(seg + 1);
        expect(inRegion(s, seg, cellUnder(s, grunt.x, grunt.y))).toBe(true);
        entered.push(seg);
        seg = grunt.seg;
      }
      leaked = ofType(events, 'leak').length > 0;
      if (leaked) {
        expect(ofType(events, 'leak')[0]).toMatchObject({ creep: grunt.id, lives: 1, restart: false });
        expect(ofType(events, 'waveEnd')).toEqual([{ type: 'waveEnd', wave: 1 }]);
      }
    }
    expect(entered).toEqual([0, 1, 2]);
    expect(s.lives).toBe(9);
    expect(s.creeps).toEqual([]);
  });

  it('only ever step to cells closer to their next waypoint', () => {
    const s = newRun(one('grunt'));
    run(s, 1, [{ type: 'startWave' }]);
    const grunt = s.creeps[0]!;
    let cell = cellUnder(s, grunt.x, grunt.y);
    let seg = grunt.seg;
    while (s.creeps.length > 0) {
      step(s, []);
      if (s.creeps.length === 0) break;
      const now = cellUnder(s, grunt.x, grunt.y);
      if (now !== cell && grunt.seg === seg) expect(pathDistance(s, seg, now)).toBeLessThan(pathDistance(s, seg, cell));
      cell = now;
      seg = grunt.seg;
    }
  });

  it('move at their speed in world units per second', () => {
    const s = newRun({ map: openMap(20, 1, [0, 0], [[[19, 0]]]), ...one('grunt') });
    run(s, 1, [{ type: 'startWave' }]);
    const grunt = s.creeps[0]!;
    const x0 = grunt.x;
    run(s, TICK_RATE);
    expect(grunt.x - x0).toBeCloseTo(270, 9);
    expect(grunt.y).toBe(CELL / 2);
  });

  it('re-route around a structure placed in front of them', () => {
    const s = newRun({ map: openMap(10, 3, [0, 1], [[[9, 1]]]), ...one('grunt') });
    run(s, 1, [{ type: 'startWave' }]);
    run(s, 10);
    const events = run(s, 1, [{ type: 'place', spec: 'rock', col: 4, row: 1 }]);
    expect(ofType(events, 'placed')).toHaveLength(1);
    const seen = new Set<number>();
    while (s.creeps.length > 0) {
      seen.add(cellUnder(s, s.creeps[0]!.x, s.creeps[0]!.y));
      step(s, []);
    }
    expect(seen.has(cellOf(s.map, 4, 1))).toBe(false);
    expect(s.lives).toBe(9);
  });

  it('regenerate up to their maximum HP', () => {
    const s = newRun(one('troll'));
    run(s, 1, [{ type: 'startWave' }]);
    const troll = s.creeps[0]!;
    troll.hp = 100;
    run(s, TICK_RATE);
    expect(troll.hp).toBeCloseTo(104, 9);
    run(s, 6 * TICK_RATE);
    expect(troll.hp).toBe(troll.maxHp);
  });
});

describe('air creeps', () => {
  it('fly straight from waypoint centre to waypoint centre, over the maze', () => {
    const s = newRun(one('bat'));
    run(s, 1, [{ type: 'startWave' }]);
    // A wall across the ground route changes nothing for a flyer.
    run(s, 1, [{ type: 'place', spec: 'rock', col: 5, row: 0 }, { type: 'place', spec: 'rock', col: 5, row: 1 }]);
    const points = airRoute(s);
    const bat = s.creeps[0]!;
    let ticks = 2;
    let length = 0;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    while (s.creeps.length > 0) {
      const a = points[bat.seg]!;
      const b = points[bat.seg + 1]!;
      const cross = (b.x - a.x) * (bat.y - a.y) - (b.y - a.y) * (bat.x - a.x);
      expect(Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-6);
      expect(Math.min(a.x, b.x) - 1e-9 <= bat.x && bat.x <= Math.max(a.x, b.x) + 1e-9).toBe(true);
      step(s, []);
      ticks++;
    }
    expect(bat.x).toBeCloseTo(points[points.length - 1]!.x, 9);
    expect(bat.y).toBeCloseTo(points[points.length - 1]!.y, 9);
    // It moves on the tick it spawns, so the trip takes exactly the straight-line distance at 320 units per second.
    expect(ticks).toBe(Math.ceil(length / (320 / TICK_RATE)));
    expect(s.lives).toBe(9);
  });
});

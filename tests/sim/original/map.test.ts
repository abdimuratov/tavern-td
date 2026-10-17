import { describe, expect, it } from 'vitest';
import { MILL_ROAD, stageMap } from '../../../src/content/original';
import {
  airLineData, airLinePolyline, buildSpotAt, buildSpotCells, routeCount, routeData, routePoint, routePolyline, validateMap,
  type MapSpec,
} from '../../../src/sim';
import { TWO_ROUTES, newRun, ofType, reasons, run, send } from './helpers';

describe('several routes per Map', () => {
  it('walks each Wave group along the route it names', () => {
    const s = newRun({
      map: TWO_ROUTES,
      waves: [{ groups: [{ creep: 'ghoul', count: 1 }, { creep: 'ghoul', count: 1, route: 1, at: 0 }] }],
    });
    expect(routeCount(s.map)).toBe(2);
    const spawned = ofType(send(s, { type: 'original.sendNow' }), 'spawn');
    expect(spawned.map((e) => [e.x, e.y])).toEqual([[0, 192], [0, 960]]);
    const [a, b] = s.creeps;
    expect([a!.route, b!.route]).toEqual([0, 1]);
    run(s, 30);
    // A Ghoul walks 160 a second along its own row.
    expect(a!.y).toBe(192);
    expect(b!.y).toBe(960);
    expect(a!.dist!).toBeCloseTo(160 + 160 / 30, 6);
    expect(b!.x).toBeCloseTo(a!.x, 9);
  });

  it('refuses a Wave that names a route the Map lacks', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'ghoul', count: 1, route: 2 }] }] });
    expect(() => send(s, { type: 'original.sendNow' })).toThrow(/no route 2/);
  });

  it('checks every route and refuses a Map with both route and routes', () => {
    expect(validateMap(TWO_ROUTES)).toBeNull();
    const both = { ...TWO_ROUTES, route: TWO_ROUTES.routes![0]! } as MapSpec;
    expect(validateMap(both)).toMatch(/route or routes/);
    const shortAir = { ...TWO_ROUTES, routes: [{ points: [[0, 192], [2048, 192]], air: [[0, 0]] }] } as unknown as MapSpec;
    expect(validateMap(shortAir)).toMatch(/air line needs at least two points/);
  });

  it('exposes each route and air line for the renderer', () => {
    const s = newRun({ map: TWO_ROUTES });
    expect(routePolyline(s, 1)).toEqual([{ x: 0, y: 960 }, { x: 2048, y: 960 }]);
    expect(airLinePolyline(s, 1)).toEqual([{ x: 0, y: 960 }, { x: 2048, y: 192 }]);
    expect(routePolyline(s, 2)).toEqual([]);
  });
});

describe('the air line', () => {
  it('flies flyers along their route\'s air line at their own speed and leaks them at its end', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'bloodbat', count: 1 }] }] });
    const spawned = ofType(send(s, { type: 'original.sendNow' }), 'spawn');
    expect([spawned[0]!.x, spawned[0]!.y]).toEqual([0, 192]);
    const bat = s.creeps[0]!;
    const line = airLineData(s.map)!;
    run(s, 60);
    // 200 a second along the line, which cuts straight over the S-bend.
    expect(bat.dist!).toBeCloseTo(200 * 61 / 30, 6);
    const p = routePoint(line, bat.dist!);
    expect(bat.x).toBeCloseTo(p.x, 9);
    expect(bat.y).toBeCloseTo(p.y, 9);
    expect(line.length).toBeLessThan(routeData(s.map)!.length / 2);
    const events = run(s, Math.ceil((line.length / 200) * 30));
    expect(ofType(events, 'leak')).toEqual([{ type: 'leak', creep: bat.id, lives: 1, restart: false }]);
    expect(s.lives).toBe(19);
  });

  it('gives each route its own air line', () => {
    const s = newRun({ map: TWO_ROUTES, waves: [{ groups: [{ creep: 'bloodbat', count: 1, route: 1 }] }] });
    send(s, { type: 'original.sendNow' });
    const bat = s.creeps[0]!;
    run(s, 90);
    // Route 1's air line climbs from the bottom-left to the top-right.
    expect(bat.y).toBeLessThan(960);
    expect(bat.x).toBeGreaterThan(0);
    expect(bat.route).toBe(1);
  });
});

describe('Build Spots', () => {
  it('lists the 2 × 2 cells of each Spot and finds the Spot under a cell', () => {
    const map = MILL_ROAD.map;
    const [col, row] = map.buildSpots![0]!;
    expect(buildSpotCells(map, 0)).toEqual([row * 32 + col, row * 32 + col + 1, (row + 1) * 32 + col, (row + 1) * 32 + col + 1]);
    expect(buildSpotAt(map, col + 1, row + 1)).toBe(0);
    expect(buildSpotAt(map, 0, 0)).toBe(-1);
    expect(buildSpotCells(map, 99)).toEqual([]);
  });

  it('refuses Spots off buildable ground or overlapping', () => {
    expect(validateMap({ ...TWO_ROUTES, buildSpots: [[0, 2]] })).toMatch(/isn't buildable/);
    expect(validateMap({ ...TWO_ROUTES, buildSpots: [[4, 7], [5, 7]] })).toMatch(/isn't buildable|overlaps/);
    expect(validateMap({ ...TWO_ROUTES, buildSpots: [[31, 7]] })).toMatch(/off the Map/);
    expect(() => stageMap('bad', [{ points: [[0, 192], [2048, 192]], air: [[0, 192], [2048, 192]] }], [[0, 2]])).toThrow(/on the road/);
  });

  it('builds only on a Spot, and only on an empty one', () => {
    const s = newRun();
    const ok = send(s, { type: 'original.build', spot: 0, spec: 'arrow_tower' });
    expect(ofType(ok, 'placed')).toHaveLength(1);
    const tower = s.towers[0]!;
    expect(tower.cells).toEqual(buildSpotCells(s.map, 0));
    expect([tower.x, tower.y]).toEqual([(MILL_ROAD.map.buildSpots![0]![0] + 1) * 64, (MILL_ROAD.map.buildSpots![0]![1] + 1) * 64]);
    expect(reasons(send(s, { type: 'original.build', spot: 0, spec: 'arrow_tower' }))).toEqual(['a tower stands there']);
    expect(reasons(send(s, { type: 'original.build', spot: 8, spec: 'arrow_tower' }))).toEqual(['no such Build Spot']);
    expect(reasons(send(s, { type: 'original.build', spot: -1, spec: 'arrow_tower' }))).toEqual(['no such Build Spot']);
    expect(reasons(send(s, { type: 'original.build', spot: 1.5, spec: 'arrow_tower' }))).toEqual(['build needs a Build Spot and a tower']);
  });
});

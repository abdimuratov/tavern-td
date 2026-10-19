import { describe, expect, it } from 'vitest';
import { MILL_ROAD, stageMap } from '../../../src/content/original';
import {
  airLineData, airLinePolyline, original, routeCount, routeData, routePoint, routePolyline, validateMap,
  type MapSpec,
} from '../../../src/sim';
import { TWO_ROUTES, modeEvents, newRun, ofType, reasons, run, send } from './helpers';

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

describe('Open ground', () => {
  const at = (s: ReturnType<typeof newRun>, col: number, row: number, spec = 'arrow_tower') => send(s, { type: 'original.build', col, row, spec });

  it('takes a tower on any 2 × 2 of it, at any alignment and at the Map\'s edges', () => {
    const s = newRun({ gold: 5000 });
    const events = at(s, 19, 4);
    expect(reasons(events)).toEqual([]);
    const tower = s.towers[0]!;
    expect(tower.cells).toEqual([4 * 32 + 19, 4 * 32 + 20, 5 * 32 + 19, 5 * 32 + 20]);
    expect([tower.x, tower.y]).toEqual([20 * 64, 5 * 64]);
    expect(modeEvents(events, 'original.built')[0]!.data).toEqual({ tower: tower.id, spec: 'arrow_tower', col: 19, row: 4, cost: 70 });
    // Odd cells, the corner and a tower far from the road are all fine.
    for (const [col, row] of [[0, 0], [3, 0], [30, 16], [21, 5]] as const) expect(reasons(at(s, col, row)), `${col}, ${row}`).toEqual([]);
    expect(s.towers).toHaveLength(5);
  });

  it('refuses a 2 × 2 off the Map, on the road, on Scenery or over a tower, in that order and in the Ghost\'s words', () => {
    const s = newRun({ gold: 5000 });
    at(s, 19, 4);
    expect(reasons(at(s, 31, 0))).toEqual(['off the Map']);
    expect(reasons(at(s, 0, 17))).toEqual(['off the Map']);
    expect(reasons(at(s, -1, 4))).toEqual(['off the Map']);
    expect(reasons(at(s, 0, 2))).toEqual(['on the road']);
    // Half on the road is on the road.
    expect(reasons(at(s, 0, 1))).toEqual(['on the road']);
    expect(reasons(at(s, 13, 4))).toEqual(['on the mill']);
    expect(reasons(at(s, 12, 6))).toEqual(['on the mill']);
    expect(reasons(at(s, 18, 11))).toEqual(['in the millpond']);
    expect(reasons(at(s, 20, 5))).toEqual(['a tower stands there']);
    // The road before Scenery, and the ground before the family or the gold.
    expect(reasons(at(s, 13, 3))).toEqual(['on the road']);
    expect(reasons(at(s, 13, 4, 'longbow_tower'))).toEqual(['on the mill']);
    s.gold = 0;
    expect(reasons(at(s, 20, 5))).toEqual(['a tower stands there']);
    expect(reasons(at(s, 23, 4))).toEqual(['needs 70 gold']);
  });

  it('names the place a tap shows: its cells, the families and why none can stand there', () => {
    const s = newRun({ cleared: 0 });
    expect(original.placeInfo(s, 19, 4)).toMatchObject({ col: 19, row: 4, cells: [147, 148, 179, 180], error: null });
    expect(original.placeInfo(s, 19, 4).options.map((o) => [o.family, o.blocked])).toEqual([['arrow', null], ['cannon', null]]);
    const pond = original.placeInfo(s, 17, 10);
    expect(pond.error).toBe('in the millpond');
    expect(pond.options.every((o) => o.blocked === 'in the millpond')).toBe(true);
    expect(original.placeInfo(s, 31, 17)).toMatchObject({ cells: [], error: 'off the Map' });
    // A Map's `#` that names no Scenery (the tests' own) still refuses.
    expect(reasons(send(newRun({ map: TWO_ROUTES }), { type: 'original.build', col: 0, row: 6, spec: 'arrow_tower' }))).toEqual(['nothing can stand there']);
  });

  it('refuses the old Spot form and a command without a whole cell', () => {
    const s = newRun();
    expect(reasons(send(s, { type: 'original.build', spot: 0, spec: 'arrow_tower' }))).toEqual(['build needs col, row and a tower']);
    expect(reasons(send(s, { type: 'original.build', col: 1.5, row: 0, spec: 'arrow_tower' }))).toEqual(['build needs col, row and a tower']);
    expect(reasons(send(s, { type: 'original.build', col: 0, row: 0 }))).toEqual(['build needs col, row and a tower']);
    expect(s.towers).toHaveLength(0);
  });

  it('paints road first and Scenery after, so a rectangle across the road leaves the road', () => {
    const river = { kind: 'water', name: 'the ford', at: 'in the ford', rects: [[10, 0, 2, 18]] } as const;
    const map = stageMap('ford', [{ points: [[0, 192], [2048, 192]], air: [[0, 192], [2048, 192]] }], [river]);
    expect(validateMap(map)).toBeNull();
    expect(map.terrain.map((r) => r.slice(10, 12))).toEqual(['##', '##', ',,', ',,', ...Array.from({ length: 14 }, () => '##')]);
    expect(map.terrain[0]!.slice(0, 10)).toBe('.'.repeat(10));
    expect(map.scenery).toEqual([river]);
    expect(() => stageMap('bad', [{ points: [[0, 192], [2048, 192]], air: [[0, 192], [2048, 192]] }], [{ ...river, rects: [[31, 0, 2, 2]] }])).toThrow(/off the Map/);
  });

  it('checks a Map\'s Scenery: whole rectangles on the Map, over no buildable cell', () => {
    const piece = (rects: unknown) => ({ ...MILL_ROAD.map, scenery: [{ kind: 'pit', name: 'a pit', at: 'in a pit', rects }] }) as unknown as MapSpec;
    expect(validateMap(MILL_ROAD.map)).toBeNull();
    expect(validateMap(piece([[13, 4, 4, 4]]))).toBeNull();
    // Over the road is fine: the road stays road.
    expect(validateMap(piece([[13, 2, 4, 6]]))).toBeNull();
    expect(validateMap(piece([[0, 0, 2, 2]]))).toMatch(/covers a buildable cell/);
    expect(validateMap(piece([[30, 0, 4, 2]]))).toMatch(/off the Map/);
    expect(validateMap(piece([[13, 4, 1.5, 4]]))).toMatch(/four whole numbers/);
    expect(validateMap(piece([]))).toMatch(/at least one rectangle/);
    expect(validateMap({ ...MILL_ROAD.map, scenery: 'mill' } as unknown as MapSpec)).toMatch(/list of pieces/);
  });
});

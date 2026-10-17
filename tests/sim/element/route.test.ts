import { describe, expect, it } from 'vitest';
import { ELEMENT_MAP, ELEMENT_ROUTE } from '../../../src/content/element';
import { element, routeData, routePoint } from '../../../src/sim';
import { buildAt, creepOnRoute, newElementRun, ofType, reasons, run, send } from './helpers';

const ROUTE = routeData(ELEMENT_MAP)!;

describe('the Element route', () => {
  it('walks Wave creeps along the lane\'s centre line, 300 units a second, from the spawn', () => {
    const s = newElementRun();
    send(s, { type: 'element.sendNow' });
    const spawned = ofType(run(s, 20), 'spawn');
    expect(spawned).toHaveLength(1);
    const c = s.creeps[0]!;
    expect(spawned[0]).toMatchObject({ x: ELEMENT_ROUTE[0]![0], y: ELEMENT_ROUTE[0]![1] });
    for (let i = 0; i < 65; i++) {
      const before = c.dist!;
      run(s, 1);
      expect(c.dist! - before).toBeCloseTo(10, 9);
      const p = routePoint(ROUTE, c.dist!);
      expect(c.x).toBeCloseTo(p.x, 9);
      expect(c.y).toBeCloseTo(p.y, 9);
    }
    // Past corner 1 (684 along), it turns down toward corner 2.
    expect(c.dist!).toBeGreaterThan(684);
    expect(c.x).toBe(832);
    expect(c.y).toBeGreaterThan(2048);
  });

  it('exposes the route polyline for the path line', () => {
    const s = newElementRun();
    const line = element.routePolyline(s);
    expect(line).toHaveLength(14);
    expect(line[0]).toEqual({ x: 148, y: 2048 });
    expect(line[13]).toEqual({ x: 148, y: 1280 });
    expect(ROUTE.length).toBe(14424);
  });

  it('a Leak costs a life and sends the creep round again with the HP it had', () => {
    const s = newElementRun();
    const c = creepOnRoute(s, 'full-1', ROUTE.leakAt - 25, 50);
    c.speed = 10;
    c.hp = 37;
    const events = run(s, 3);
    expect(ofType(events, 'leak')).toEqual([{ type: 'leak', creep: c.id, lives: 1, restart: true }]);
    expect(s.lives).toBe(49);
    expect(c.hp).toBe(37);
    expect(c.dist).toBe(0);
    expect({ x: c.x, y: c.y }).toEqual({ x: 148, y: 2048 });
    expect(s.creeps).toContain(c);
    run(s, 1);
    expect(c.dist).toBeCloseTo(10, 9);
  });

  it('charges 2 for a bulky creep, 3 for an Elemental and 3 per creep during boss Waves', () => {
    const s = newElementRun();
    const leakOf = (spec: string, wave = 0): number => {
      const c = creepOnRoute(s, spec, ROUTE.leakAt - 5);
      c.speed = 10;
      c.wave = wave;
      const lives = ofType(run(s, 1), 'leak')[0]!.lives;
      c.hp = 0;
      run(s, 1);
      return lives;
    };
    expect(leakOf('full-28')).toBe(2);
    expect(leakOf('elemental-fire-1')).toBe(3);
    expect(leakOf('boss-heal', 56)).toBe(3);
    expect(leakOf('boss-bulky', 56)).toBe(6);
  });

  it('keeps towers off the lane, so nothing can Block it', () => {
    const s = newElementRun();
    expect(reasons(send(s, { type: 'element.build', spec: 'basic_arrow_tower', col: 1, row: 31 }))).toEqual(['towers go beside the lane, on raised ground']);
    expect(element.buildSpot(s, 17, 6)).toEqual({ cells: [353, 354, 409, 410], error: null });
    buildAt(s, 'basic_arrow_tower', 17, 6);
    expect(element.buildSpot(s, 18, 7).error).toBe('another tower is there');
    expect(element.buildSpot(s, 55, 39).error).toBe('off the Map');
  });
});

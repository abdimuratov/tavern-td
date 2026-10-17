import { describe, expect, it } from 'vitest';
import { element } from '../../../src/sim';
import {
  PLOT_SPOTS, buildAt, finishBuilding, modeEvents, newElementRun, ofType, reasons, run, send, setLevels, towerOf,
} from './helpers';

const [A, B, C] = PLOT_SPOTS;

describe('Element unlock rules', () => {
  it('builds Arrow and Cannon from the start; a single needs its Element at 1', () => {
    const s = newElementRun();
    const opts = Object.fromEntries(element.buildOptions(s).map((o) => [o.spec, o.blocked]));
    expect(opts['basic_arrow_tower']).toBeNull();
    expect(opts['basic_cannon_tower']).toBeNull();
    expect(opts['fire_tower']).toBe('needs Fire 1');
    expect(opts['periodic_tower']).toBe('needs all six Elements at level 1');
    expect(reasons(send(s, { type: 'element.build', spec: 'fire_tower', col: A![0], row: A![1] }))).toEqual(['needs Fire 1']);
    expect(reasons(send(s, { type: 'element.build', spec: 'ice_tower', col: A![0], row: A![1] }))).toEqual(['made by upgrading a tower']);
    setLevels(s, { fire: 1 });
    const t = buildAt(s, 'fire_tower', A![0], A![1]);
    expect(s.gold).toBe(75);
    expect(element.towerInfo(s, t.id)).toMatchObject({ built: false, buildTicksLeft: 29, name: 'Brazier' });
  });

  it('opens duals with both Elements at 1 and triples with all three; levels 2 and 3 need the Elements at 2 and 3', () => {
    const s = newElementRun();
    s.gold = 100_000;
    setLevels(s, { water: 1, light: 1 });
    const t = buildAt(s, 'light_tower', A![0], A![1]);
    const before = element.towerActions(s, t.id)!;
    expect(before.upgrades.find((u) => u.to === 'ice_tower')).toMatchObject({ cost: 425, needs: null, blocked: 'still building' });
    expect(before.upgrades.find((u) => u.to === 'quark_tower')).toMatchObject({ needs: 'needs Earth 1' });
    expect(before.upgrades.find((u) => u.to === 'focused_light_tower')).toMatchObject({ cost: 575, needs: 'needs Light 2' });
    run(s, 30);
    send(s, { type: 'element.upgrade', tower: t.id, to: 'ice_tower' });
    expect(towerOf(s, t.id).spec).toBe('ice_tower');
    finishBuilding(s, t);
    const dual = element.towerActions(s, t.id)!;
    expect(dual.upgrades.map((u) => u.to)).toEqual(['ice_tower_2', 'windstorm_tower', 'hail_tower', 'tidal_tower', 'polar_tower']);
    expect(dual.upgrades.find((u) => u.to === 'ice_tower_2')!.needs).toBe('needs Water 2 and Light 2');
    expect(dual.upgrades.find((u) => u.to === 'polar_tower')!.needs).toBe('needs Earth 1');
    setLevels(s, { earth: 1 });
    send(s, { type: 'element.upgrade', tower: t.id, to: 'polar_tower' });
    expect(towerOf(s, t.id).spec).toBe('polar_tower');
    finishBuilding(s, t);
    // A triple climbs only its own line.
    expect(element.towerActions(s, t.id)!.upgrades.map((u) => u.to)).toEqual(['polar_tower_2']);
  });

  it('refuses upgrades it can\'t pay for or that aren\'t on the tree', () => {
    const s = newElementRun();
    setLevels(s, { fire: 3 });
    const t = buildAt(s, 'fire_tower', A![0], A![1]);
    finishBuilding(s, t);
    expect(reasons(send(s, { type: 'element.upgrade', tower: t.id, to: 'focused_fire_tower' }))).toEqual(['needs 575 gold']);
    expect(reasons(send(s, { type: 'element.upgrade', tower: t.id, to: 'refined_fire_tower' }))).toEqual(['Brazier can\'t become that']);
    expect(reasons(send(s, { type: 'element.upgrade', tower: t.id }))).toEqual(['upgrade needs the tower to become']);
  });

  it('turns a refined single Pure with 10,000 gold and a Pure Essence; builds the Periodic tower with all six at 1', () => {
    const s = newElementRun();
    s.gold = 50_000;
    setLevels(s, { water: 3, fire: 1, nature: 1, earth: 1, light: 1, dark: 1 });
    const t = buildAt(s, 'water_tower', A![0], A![1]);
    for (const to of ['focused_water_tower', 'refined_water_tower']) {
      finishBuilding(s, t);
      send(s, { type: 'element.upgrade', tower: t.id, to });
    }
    finishBuilding(s, t);
    expect(reasons(send(s, { type: 'element.upgrade', tower: t.id, to: 'pure_water_tower' }))).toEqual(['needs a Pure Essence']);
    s.mode.essence = 2;
    send(s, { type: 'element.upgrade', tower: t.id, to: 'pure_water_tower' });
    expect(towerOf(s, t.id).spec).toBe('pure_water_tower');
    expect(s.mode.essence).toBe(1);
    const p = buildAt(s, 'periodic_tower', B![0], B![1]);
    expect(s.mode.essence).toBe(0);
    expect(element.towerInfo(s, p.id)).toMatchObject({ buildTicksLeft: 179, name: 'Sixfold Core' });
  });
});

describe('Element selling', () => {
  it('refunds 90%, 98% for the Arrow and Cannon lines (elemental ones round up), and 100% in All Random', () => {
    const s = newElementRun();
    s.gold = 10_000;
    setLevels(s, { fire: 1, water: 1 });
    const arrow = buildAt(s, 'basic_arrow_tower', A![0], A![1]);
    const fire = buildAt(s, 'fire_tower', B![0], B![1]);
    const cannon = buildAt(s, 'basic_cannon_tower', C![0], C![1]);
    run(s, 30);
    send(s, { type: 'element.upgrade', tower: cannon.id, to: 'fire_cannon_tower' });
    send(s, { type: 'element.upgrade', tower: fire.id, to: 'vapor_tower' });
    expect(reasons(send(s, { type: 'element.sell', tower: fire.id }))).toEqual(['still building']);
    run(s, 60);
    expect(element.towerActions(s, arrow.id)!.sell).toEqual({ gold: 98, essence: 0, blocked: null });
    expect(element.towerActions(s, cannon.id)!.sell.gold).toBe(221);
    expect(element.towerActions(s, fire.id)!.sell.gold).toBe(540);
    const gold = s.gold;
    const events = send(s, { type: 'element.sell', tower: fire.id });
    expect(ofType(events, 'removed')).toHaveLength(1);
    expect(s.gold).toBe(gold + 540);
    expect(s.grid.filter((id) => id === fire.id)).toEqual([]);

    const r = newElementRun({ picks: 'allRandom' });
    r.gold = 1000;
    const a = buildAt(r, 'basic_arrow_tower', A![0], A![1]);
    run(r, 30);
    expect(element.towerActions(r, a.id)!.sell.gold).toBe(100);
  });

  it('returns a Pure tower\'s essence with its gold', () => {
    const s = newElementRun();
    s.gold = 30_000;
    s.mode.essence = 1;
    setLevels(s, { dark: 3 });
    const t = buildAt(s, 'dark_tower', A![0], A![1]);
    for (const to of ['focused_dark_tower', 'refined_dark_tower', 'pure_dark_tower']) {
      finishBuilding(s, t);
      send(s, { type: 'element.upgrade', tower: t.id, to });
    }
    finishBuilding(s, t);
    expect(element.towerActions(s, t.id)!.sell).toEqual({ gold: 11700, essence: 1, blocked: null });
    send(s, { type: 'element.sell', tower: t.id });
    expect(s.mode.essence).toBe(1);
  });

  it('keeps kills across an upgrade within one family and resets them on a branch', () => {
    const s = newElementRun();
    s.gold = 10_000;
    setLevels(s, { dark: 2, water: 1 });
    const a = buildAt(s, 'dark_tower', A![0], A![1]);
    const b = buildAt(s, 'dark_tower', B![0], B![1]);
    finishBuilding(s, a);
    finishBuilding(s, b);
    a.kills = 7;
    b.kills = 7;
    send(s, { type: 'element.upgrade', tower: a.id, to: 'focused_dark_tower' }, { type: 'element.upgrade', tower: b.id, to: 'poison_tower' });
    expect([towerOf(s, a.id).kills, towerOf(s, b.id).kills]).toEqual([7, 0]);
    expect(modeEvents(run(s, 1), 'element.upgraded')).toEqual([]);
  });
});

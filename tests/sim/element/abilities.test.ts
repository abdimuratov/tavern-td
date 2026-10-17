import { describe, expect, it } from 'vitest';
import { element } from '../../../src/sim';
import { hitCreep, modeEvents, newElementRun, ofType, onTopLane, placeTower, run, send, towerOf } from './helpers';

// Towers stand at (17, 6): centre (1152, 448), 320 above the lane's top run.
const X = 1152;
const COL = 17;
const ROW = 6;

describe('Element damage model', () => {
  it('applies the Element cycle: 200% forward, 50% back, 90% into Composite, Composite 100%', () => {
    const s = newElementRun();
    const fire = onTopLane(s, 'full-3', 3000, 10_000);
    const dark = onTopLane(s, 'full-7', 3000, 10_000);
    const comp = onTopLane(s, 'full-13', 3000, 10_000);
    hitCreep(s, fire, 210, 0, 'water');
    hitCreep(s, dark, 210, 0, 'water');
    hitCreep(s, comp, 210, 0, 'water');
    expect([fire.hp, dark.hp, comp.hp]).toEqual([10_000 - 420, 10_000 - 105, 10_000 - 189]);
    hitCreep(s, fire, 70, 0, 'composite');
    expect(fire.hp).toBe(10_000 - 490);
  });

  it('lands a tower\'s attack through it: a Water Arrow doubles into a Fire creep', () => {
    const s = newElementRun();
    placeTower(s, 'water_arrow_tower', COL, ROW);
    const c = onTopLane(s, 'full-3', X, 10_000);
    const events = run(s, 10);
    expect(ofType(events, 'fire')).toHaveLength(1);
    expect(ofType(events, 'hit')[0]).toMatchObject({ creep: c.id, damage: 420, kind: 'attack' });
    expect(c.hp).toBe(10_000 - 420);
  });

  it('splits splash in two halves: 100% within the full radius, 50% out to the half radius', () => {
    const s = newElementRun();
    placeTower(s, 'basic_cannon_tower', COL, ROW);
    const a = onTopLane(s, 'full-1', X, 10_000);
    const b = onTopLane(s, 'full-1', X + 150, 10_000);
    const c = onTopLane(s, 'full-1', X + 250, 10_000);
    run(s, 10);
    expect([a.hp, b.hp, c.hp]).toEqual([10_000 - 90, 10_000 - 45, 10_000]);
  });

  it('Dark: a kill\'s excess flies to a creep within 500 as pure damage', () => {
    const s = newElementRun();
    placeTower(s, 'dark_tower', COL, ROW);
    const a = onTopLane(s, 'full-1', X, 100);
    const b = onTopLane(s, 'full-2', X + 300, 10_000);
    const events = run(s, 20);
    expect(ofType(events, 'kill').map((e) => e.creep)).toEqual([a.id]);
    expect(ofType(events, 'fire').map((e) => e.target)).toEqual([a.id, b.id]);
    // Dark into Water would be 200%; the overkill bolt is pure.
    expect(b.hp).toBe(10_000 - 260);
  });

  it('Light: each consecutive hit on one creep adds 5 base damage', () => {
    const s = newElementRun();
    placeTower(s, 'light_tower', COL, ROW);
    const c = onTopLane(s, 'full-3', X, 10_000);
    const hits = ofType(run(s, 65), 'hit').map((e) => e.damage);
    expect(hits).toEqual([120, 125, 130, 135]);
    expect(c.hp).toBe(10_000 - 510);
  });

  it('Electricity: chain lightning from its attack, ×1.2 a bounce, the radius shrinking ×0.75', () => {
    const s = newElementRun();
    placeTower(s, 'electricity_tower', COL, ROW);
    const a = onTopLane(s, 'full-1', X, 10_000);
    const b = onTopLane(s, 'full-1', X + 200, 10_000);
    const c = onTopLane(s, 'full-1', X + 400, 10_000);
    run(s, 20);
    expect([10_000 - a.hp, 10_000 - b.hp, 10_000 - c.hp]).toEqual([240 + 346, 288, 0]);
  });

  it('Poison: every creep near the target gets its own 10 s contamination, 40 every 0.5 s', () => {
    const s = newElementRun();
    const t = placeTower(s, 'poison_tower', COL, ROW);
    const c = onTopLane(s, 'full-1', X, 100_000);
    for (let i = 0; i < 30 && c.hp === c.maxHp; i++) run(s, 1);
    expect(c.hp).toBe(100_000 - 200);
    send(s, { type: 'element.sell', tower: t.id });
    const dots = s.mode.timers.filter((x) => x.kind === 'dot');
    expect(dots).toEqual([expect.objectContaining({ creep: c.id, damage: 40, every: 15, left: 20 })]);
    run(s, 14);
    expect(c.hp).toBe(100_000 - 240);
    run(s, 300);
    expect(c.hp).toBe(100_000 - 200 - 800);
  });

  it('Periodic: one shot per Element, 5 or 6 by how many creeps are in range', () => {
    const shotsWith = (n: number): string[] => {
      const s = newElementRun();
      placeTower(s, 'periodic_tower', COL, ROW);
      for (let i = 0; i < n; i++) onTopLane(s, 'full-1', X + 60 * i, 1_000_000);
      run(s, 1);
      return s.projectiles.map((p) => p.spec);
    };
    expect(shotsWith(1)).toEqual(['light', 'dark', 'water', 'fire', 'nature'].map((e) => `shot:periodic-${e}`));
    expect(shotsWith(2)).toHaveLength(6);
    expect(shotsWith(4)).toHaveLength(6);
    expect(shotsWith(5)).toHaveLength(5);
    expect(shotsWith(7)).toHaveLength(6);
  });

  it('Hydro: a kill by its own hit explodes for 700 within 300', () => {
    const s = newElementRun();
    placeTower(s, 'hydro_tower', COL, ROW);
    const weak = onTopLane(s, 'full-1', X + 100, 500);
    const near = onTopLane(s, 'full-1', X - 100, 10_000);
    const events = run(s, 15);
    expect(ofType(events, 'kill').map((e) => e.creep)).toEqual([weak.id]);
    expect(near.hp).toBe(10_000 - 700);
  });

  it('Gold: its kills pay 35% more bounty', () => {
    const s = newElementRun();
    placeTower(s, 'gold_tower', COL, ROW);
    const c = onTopLane(s, 'full-1', X, 100);
    c.bounty = 10;
    const kill = ofType(run(s, 15), 'kill')[0]!;
    expect(kill.bounty).toBe(14);
  });

  it('Blacksmith and Well: once a second after building, buff the best tower within 900 for 60 s', () => {
    const s = newElementRun();
    const smith = placeTower(s, 'blacksmith_tower', COL, ROW);
    const well = placeTower(s, 'well_tower', COL, ROW + 2);
    const arrow = placeTower(s, 'basic_arrow_tower', COL + 4, ROW);
    const single = placeTower(s, 'light_tower', COL + 2, ROW);
    const dual = placeTower(s, 'ice_tower', COL + 2, ROW + 2);
    run(s, 30);
    expect(dual.status).toEqual([]);
    const events = run(s, 1);
    expect(modeEvents(events, 'element.fireUp')[0]!.data).toEqual({ tower: smith.id, target: dual.id, value: 0.15 });
    expect(modeEvents(events, 'element.springForward')[0]!.data).toEqual({ tower: well.id, target: dual.id, value: 0.15 });
    expect(element.towerInfo(s, dual.id)).toMatchObject({ fireUp: 0.15, springForward: 0.15 });
    // 15 s later the next goes to the next best: the single, never the support Arrow.
    run(s, 450);
    expect(element.towerInfo(s, single.id)!.fireUp).toBe(0.15);
    expect(arrow.status).toEqual([]);
  });

  it('Trickery: copies a tower with a target onto the nearest free spot for 10 s; a copy sells for nothing', () => {
    const s = newElementRun();
    placeTower(s, 'trickery_tower', COL, ROW);
    const light = placeTower(s, 'light_tower', COL + 2, ROW);
    onTopLane(s, 'full-1', X + 128, 1_000_000);
    const events = run(s, 31);
    const made = modeEvents(events, 'element.clone')[0]!.data as { copy: number; of: number; until: number };
    expect(made.of).toBe(light.id);
    const copy = towerOf(s, made.copy);
    expect(copy.spec).toBe('light_tower');
    expect(element.towerInfo(s, copy.id)!.copyUntil).toBe(made.until);
    expect(element.towerActions(s, copy.id)!.sell.gold).toBe(0);
    expect(element.towerActions(s, copy.id)!.upgrades[0]!.blocked).toBe('a copy can\'t be upgraded');
    run(s, 300);
    expect(s.towers.find((t) => t.id === copy.id)).toBeUndefined();
  });

  it('Haste: each attack takes 0.03 s off its attack time, up to 16', () => {
    const s = newElementRun();
    const t = placeTower(s, 'haste_tower', COL, ROW);
    onTopLane(s, 'full-1', X, 10_000_000);
    const fires = ofType(run(s, 60), 'fire').length;
    expect(fires).toBe(4);
    expect(element.towerInfo(s, t.id)!.cooldown).toBeCloseTo(0.66 - 0.03 * 4, 9);
  });

  it('Vapor: a pulse hits every creep within 600 for 60 plus 30 per creep', () => {
    const s = newElementRun();
    placeTower(s, 'vapor_tower', COL, ROW);
    const a = onTopLane(s, 'full-1', X, 10_000);
    const b = onTopLane(s, 'full-1', X + 300, 10_000);
    const far = onTopLane(s, 'full-1', X + 900, 10_000);
    run(s, 1);
    expect([a.hp, b.hp, far.hp]).toEqual([10_000 - 120, 10_000 - 120, 10_000]);
    run(s, 44);
    expect(a.hp).toBe(10_000 - 120);
    run(s, 1);
    expect(a.hp).toBe(10_000 - 240);
  });

  it('Ice: a ministun on the target, then 1.2 s before another Ice stun can land', () => {
    const s = newElementRun();
    placeTower(s, 'ice_tower', COL, ROW);
    const c = onTopLane(s, 'full-1', X, 1_000_000);
    for (let i = 0; i < 20 && !c.status.some((x) => x.key === element.STUN); i++) run(s, 1);
    const stun = c.status.find((x) => x.key === element.STUN)!;
    expect(stun.ticks).toBeLessThanOrEqual(5);
    expect(s.mode.creeps[String(c.id)]!.iceUntil - s.tick).toBe(35);
  });

  it('Flamethrower: napalm builds on every creep near the hit and goes off 5 s later', () => {
    const s = newElementRun();
    const t = placeTower(s, 'flamethrower_tower', COL, ROW);
    const c = onTopLane(s, 'full-1', X, 1_000_000);
    for (let i = 0; i < 20 && c.hp === c.maxHp; i++) run(s, 1);
    send(s, { type: 'element.sell', tower: t.id });
    expect(s.mode.creeps[String(c.id)]).toMatchObject({ napalm: 180 });
    const hp = c.hp;
    const events = run(s, 150);
    expect(modeEvents(events, 'element.napalm')).toHaveLength(1);
    expect(c.hp).toBe(hp - 180);
  });

  it('Magic: every attack shortens its range by 25', () => {
    const s = newElementRun();
    const t = placeTower(s, 'magic_tower', COL, ROW);
    onTopLane(s, 'full-1', X, 10_000_000);
    run(s, 20);
    expect(element.towerInfo(s, t.id)!.range).toBe(1500 - 25 * element.towerInfo(s, t.id)!.stacks);
    // 0.31 s apart: attacks on ticks 0, 10 and 19.
    expect(element.towerInfo(s, t.id)!.stacks).toBe(3);
    expect(element.towerInfo(s, t.id)!.range).toBe(1425);
  });

  it('Quake: every fifth attack hits every creep within 550 for 1,800 plus 1% of its HP', () => {
    const s = newElementRun();
    placeTower(s, 'quake_tower', COL, ROW);
    const c = onTopLane(s, 'full-1', X, 1_000_000);
    const events = run(s, 4 * 20 + 1);
    expect(modeEvents(events, 'element.quake')).toHaveLength(1);
    expect(c.hp).toBeLessThan(1_000_000 - 5 * 1800);
  });
});

import { describe, expect, it } from 'vitest';
import { element } from '../../../src/sim';
import {
  PLOT_SPOTS, buildAt, creepOnRoute, finishBuilding, hitCreep, modeEvents, newElementRun, ofType, run, setLevels,
} from './helpers';

/** Distance walked on each of the next `ticks` steps. */
function strides(s: ReturnType<typeof newElementRun>, c: { dist?: number }, ticks: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const before = c.dist!;
    run(s, 1);
    out.push(Math.round((c.dist! - before) * 1000) / 1000);
  }
  return out;
}

describe('Element Traits', () => {
  it('fast: a 1 s burst at 750 every 3 s from 3 s in, ignoring slows', () => {
    const s = newElementRun();
    const c = creepOnRoute(s, 'full-13', 0);
    c.speed = 10;
    const steps = strides(s, c, 220);
    expect(steps.slice(0, 90).every((d) => d === 10)).toBe(true);
    expect(steps.slice(90, 120).every((d) => d === 25)).toBe(true);
    expect(steps.slice(120, 180).every((d) => d === 10)).toBe(true);
    expect(steps.slice(180, 210).every((d) => d === 25)).toBe(true);
    // Slowed by sludge (−52%): 4.8 a tick, but the burst still runs at 750.
    const d = creepOnRoute(s, 'full-13', 0);
    d.speed = 10;
    d.status.push({ kind: element.STATUS.slow, key: element.slowKey('sludge'), value: 0.52, ticks: 1000, src: 0 });
    const slowed = strides(s, d, 100);
    expect(slowed[10]).toBeCloseTo(4.8, 9);
    expect(slowed[95]).toBe(25);
  });

  it('heal: on death it heals creeps within 300 by 18% of their max HP', () => {
    const s = newElementRun();
    const dying = creepOnRoute(s, 'full-9', 1000);
    const near = creepOnRoute(s, 'full-9', 1100);
    const far = creepOnRoute(s, 'full-9', 3000);
    near.hp = 100;
    far.hp = 100;
    const events = hitCreep(s, dying, 10_000);
    expect(ofType(events, 'kill')).toHaveLength(1);
    expect(near.hp).toBe(100 + Math.floor(260 * 0.18));
    expect(far.hp).toBe(100);
    expect(modeEvents(events, 'element.heal')).toHaveLength(1);
  });

  it('mechanical: a random 1–6 s in and every 8 s, it purges slows and turns untargetable for 2 s', () => {
    const s = newElementRun({ seed: 9 });
    const c = creepOnRoute(s, 'full-15', 2000);
    const first = s.mode.creeps[String(c.id)]!.mech - s.tick;
    expect(first % 30).toBe(0);
    expect(first / 30).toBeGreaterThanOrEqual(1);
    expect(first / 30).toBeLessThanOrEqual(6);
    c.status.push({ kind: element.STATUS.slow, key: element.slowKey('gaia'), value: 0.28, ticks: 10_000, src: 0 });
    run(s, first);
    expect(element.targetable(c)).toBe(true);
    run(s, 1);
    expect(element.targetable(c)).toBe(false);
    expect(c.status.map((x) => x.key)).toEqual([element.SHIELD]);
    run(s, 59);
    expect(element.targetable(c)).toBe(true);
    run(s, 8 * 30 - 60);
    expect(element.targetable(c)).toBe(true);
    run(s, 1);
    expect(element.targetable(c)).toBe(false);
  });

  it('undead: the first death pays nothing and counts no kill; 3 s later it rises at half HP', () => {
    const s = newElementRun();
    s.gold = 1000;
    setLevels(s, { fire: 1 });
    const tower = buildAt(s, 'fire_tower', ...PLOT_SPOTS[0]!);
    const c = creepOnRoute(s, 'full-4', 1000);
    c.bounty = 2;
    const gold = s.gold;
    const fell = hitCreep(s, c, 500, tower.id);
    expect(ofType(fell, 'kill')).toEqual([]);
    expect(modeEvents(fell, 'element.fell')).toHaveLength(1);
    expect(s.gold).toBe(gold);
    expect(tower.kills).toBe(0);
    expect(element.targetable(c)).toBe(false);
    expect(hitCreep(s, c, 500).length).toBe(0);
    run(s, 90);
    expect(element.targetable(c)).toBe(false);
    const rose = run(s, 1);
    expect(modeEvents(rose, 'element.rose')).toHaveLength(1);
    expect(c.hp).toBe(60);
    expect(element.targetable(c)).toBe(true);
    const died = hitCreep(s, c, 500, tower.id);
    expect(ofType(died, 'kill')[0]).toMatchObject({ bounty: 2 });
    expect(tower.kills).toBe(1);
  });

  it('regen: 1.25% of max HP every 0.5 s while hurt, until it has healed its max HP in all', () => {
    const s = newElementRun();
    const c = creepOnRoute(s, 'full-8', 1000);
    c.hp = 100;
    run(s, 15);
    expect(c.hp).toBe(100);
    run(s, 1);
    expect(c.hp).toBe(102);
    run(s, 15);
    expect(c.hp).toBe(104);
    const cs = s.mode.creeps[String(c.id)]!;
    cs.healed = 223;
    run(s, 15);
    expect(c.hp).toBe(104);
  });

  it('bulky: 15 creeps a second apart, at 2× HP and bounty', () => {
    const s = newElementRun();
    s.wave.number = 27;
    s.mode.completed = 27;
    const events = run(s, 30 * 16, [{ type: 'element.sendNow' }]);
    const spawns = ofType(events, 'spawn');
    expect(spawns).toHaveLength(15);
    expect(spawns.every((e) => e.spec === 'full-28')).toBe(true);
    const creep = s.creeps[0]!;
    expect({ hp: creep.maxHp, bounty: creep.bounty }).toEqual({ hp: 9932, bounty: 36 });
  });

  it('vengeance: its killer and towers within 250 of it deal 10% less per stack for 10 s', () => {
    const s = newElementRun();
    s.gold = 1000;
    const a = buildAt(s, 'basic_arrow_tower', 17, 6);
    const b = buildAt(s, 'basic_arrow_tower', 19, 6);
    const far = buildAt(s, 'basic_arrow_tower', 47, 6);
    const c = creepOnRoute(s, 'full-10', 1000);
    hitCreep(s, c, 10_000, a.id);
    expect([a, b, far].map((t) => s.mode.towers[String(t.id)]!.vengeance.length)).toEqual([1, 1, 0]);
    const victim = creepOnRoute(s, 'full-1', 2000, 10_000);
    hitCreep(s, victim, 100, a.id);
    expect(victim.hp).toBe(10_000 - 90);
    run(s, 300);
    expect(s.mode.towers[String(a.id)]!.vengeance).toHaveLength(1);
    run(s, 1);
    expect(s.mode.towers[String(a.id)]!.vengeance).toEqual([]);
  });

  it('time lapse: armed after 5 s, a hit that would leave ≤25% HP rewinds it 5 s instead, once', () => {
    const s = newElementRun();
    const c = creepOnRoute(s, 'full-6', 0);
    c.speed = 10;
    run(s, 200);
    const distThen = 10 * 50;
    expect(c.dist).toBeCloseTo(2000, 6);
    c.hp = 100;
    const events = hitCreep(s, c, 90);
    expect(ofType(events, 'hit')).toEqual([]);
    expect(modeEvents(events, 'element.timeLapse')).toHaveLength(1);
    expect(c.hp).toBe(163);
    expect(c.dist!).toBeGreaterThanOrEqual(distThen - 30);
    expect(c.dist!).toBeLessThanOrEqual(distThen);
    expect(ofType(hitCreep(s, c, 1000), 'kill')).toHaveLength(1);
    // Not armed in its first 5 s.
    const young = creepOnRoute(s, 'full-6', 0);
    run(s, 100);
    expect(ofType(hitCreep(s, young, 1000), 'kill')).toHaveLength(1);
  });

  it('boss regen ticks every 0.1 s for 0.25% of max HP', () => {
    const s = newElementRun();
    const c = creepOnRoute(s, 'boss-regen', 1000, 400_000);
    c.hp = 1000;
    run(s, 4);
    expect(c.hp).toBe(2000);
  });

  it('builds the defenders used above', () => {
    const s = newElementRun();
    setLevels(s, { light: 1 });
    const t = buildAt(s, 'light_tower', ...PLOT_SPOTS[3]!);
    finishBuilding(s, t);
    expect(element.towerInfo(s, t.id)!.built).toBe(true);
  });
});

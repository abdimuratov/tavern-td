import { describe, expect, it } from 'vitest';
import { addTower, cellOf, gem, spawnCreep, step, type Creep, type Tower } from '../../../src/sim';
import { newGemRun, ofType, type GemRun } from './helpers';

// Gem's abilities against creeps that stand still, on an otherwise empty field.

/** A Run mid-"Wave": abilities that run only during Waves are live while these creeps are. */
function arena(seed = 9): GemRun {
  const s = newGemRun(seed);
  s.wave.number = 1;
  s.wave.active = [{ number: 1, groups: [] }];
  s.phase = 'wave';
  return s;
}

function tower(s: GemRun, spec: string, col: number, row: number): Tower {
  return addTower(s, spec, cellOf(s.map, col, row), []);
}

/** A stationary creep `dx`, `dy` cells from a tower's centre. */
function creepNear(s: GemRun, t: Tower, spec: string, dx: number, dy = 0, hp?: number): Creep {
  const c = spawnCreep(s, spec, hp === undefined ? { wave: 1, speed: 0 } : { wave: 1, speed: 0, hp }, []);
  c.x = t.x + dx * 64;
  c.y = t.y + dy * 64;
  return c;
}

function run(s: GemRun, ticks: number) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...step(s, []));
  return events;
}

describe('Gem abilities', () => {
  it('Barrage hits up to N of the nearest enemies on its own cooldown', () => {
    const s = arena();
    const t = tower(s, 'topaz-flawed', 40, 50);
    const creeps = [1, 2, 3].map((d) => creepNear(s, t, 'wave-1', d, 0, 10_000));
    const events = run(s, 30);
    // Flawed Topaz: Barrage 8 to 2 targets every 1 s, as well as its attack on one.
    const barrageHits = ofType(events, 'fire').filter((e) => e.projectile === 0);
    expect(barrageHits.map((e) => e.target)).toEqual([creeps[0]!.id, creeps[1]!.id]);
  });

  it('burns everything in range, air too, with spell damage that ignores armor', () => {
    const s = arena();
    const t = tower(s, 'star-ruby', 40, 50);
    const ground = creepNear(s, t, 'wave-10', 2, 0, 10_000); // hero armor 15
    const air = creepNear(s, t, 'wave-4', 0, 2, 10_000); // Pink armor 12
    const far = creepNear(s, t, 'wave-10', 6, 0, 10_000);
    run(s, 30);
    // 30 per second: × 1.75 for hero armor on the Spells row, no armor value.
    expect(10_000 - ground.hp).toBeCloseTo(30 * 1.75, 6);
    expect(10_000 - air.hp).toBeCloseTo(30, 6);
    expect(far.hp).toBe(10_000);
    // +10% per 10 kills.
    t.kills = 25;
    run(s, 30);
    expect(10_000 - air.hp).toBeCloseTo(30 + 36, 6);
  });

  it('poisons with spell damage, the strongest poison only', () => {
    const s = arena();
    const weak = tower(s, 'emerald-chipped', 40, 50);
    const strong = tower(s, 'emerald-flawed', 40, 52);
    const c = creepNear(s, weak, 'wave-1', 1, 0, 100_000);
    run(s, 60);
    const poisons = c.status.filter((x) => x.kind === 'gem.poison');
    expect(poisons.length).toBeGreaterThan(0);
    // Both poison it; only the stronger (Flawed, 4/s) counts.
    expect(poisons.find((p) => p.value === 4)?.src).toBe(strong.id);
    expect(c.status.some((x) => x.key === 'gem:poison-slow')).toBe(true);
  });

  it('gives every tower +10% attack damage per 10 kills, up to +120%', () => {
    const s = arena();
    const t = tower(s, 'diamond-chipped', 40, 50);
    creepNear(s, t, 'wave-1', 1, 0, 100_000);
    t.kills = 37;
    run(s, 2);
    expect(gem.towerInfo(s, t.id)).toMatchObject({ kills: 37, killStep: 4, killBonus: 0.30000000000000004 });
    expect(gem.towerInfo(s, t.id)!.damageBonus).toBeCloseTo(0.3, 9);
    t.kills = 500;
    run(s, 2);
    expect(gem.towerInfo(s, t.id)!.damageBonus).toBeCloseTo(1.2, 9);
  });

  it('bounces Dark Emerald hits to one more creep per Dark Emerald you own', () => {
    const s = arena();
    const t = tower(s, 'dark-emerald', 40, 50);
    const creeps = [2, 5, 8].map((d) => creepNear(s, t, 'wave-1', d, 0, 100_000));
    const events = run(s, 40);
    const struck = new Set(ofType(events, 'hit').map((e) => e.creep));
    // One Dark Emerald: the target and one bounce within 256.
    expect(struck.has(creeps[0]!.id) && struck.has(creeps[1]!.id)).toBe(true);
    expect(struck.has(creeps[2]!.id)).toBe(false);
    tower(s, 'enchanted-emerald', 30, 40);
    const more = new Set(ofType(run(s, 40), 'hit').map((e) => e.creep));
    expect(more.has(creeps[2]!.id)).toBe(true);
  });

  it('refuses a new stun for 0.1 s after one ends', () => {
    const s = arena();
    const t = tower(s, 'hold-slate', 40, 50);
    const c = creepNear(s, t, 'wave-1', 0, 0, 100_000);
    const events = run(s, 2);
    const grabs = ofType(events, 'mode').filter((e) => e.name === 'gem.spell');
    expect(grabs).toHaveLength(1);
    expect(c.status.find((x) => x.key === 'gem:stun')!.ticks).toBeGreaterThan(40);
    // 160 chaos damage, armor 12 normal: 160 × 1.6 / 1.72.
    expect(100_000 - c.hp).toBeCloseTo((160 * 1.6) / 1.72, 6);
    // Disarmed 3.5 s; a second Hold Slate can't stun it while stunned or 0.1 s after.
    const other = tower(s, 'hold-slate', 40, 52);
    other.cd = 0;
    const during = run(s, 44);
    expect(ofType(during, 'mode').filter((e) => e.name === 'gem.spell')).toHaveLength(0);
    expect(c.status.some((x) => x.key === 'gem:stun')).toBe(false);
    expect(c.status.some((x) => x.key === 'gem:stun-guard')).toBe(true);
    const after = run(s, 6);
    expect(ofType(after, 'mode').filter((e) => e.name === 'gem.spell').map((e) => (e.data as { tower: number }).tower)).toEqual([other.id]);
    expect(c.status.some((x) => x.key === 'gem:stun')).toBe(true);
  });

  it('never slows a creep below its minimum speed', () => {
    const s = arena();
    const t = tower(s, 'uranium-238', 40, 50);
    const c = creepNear(s, t, 'wave-41', 1, 0, 1e9);
    c.speed = 522 / 30;
    let walked = 0;
    for (let i = 0; i < 30; i++) {
      const [x, y] = [c.x, c.y];
      step(s, []);
      if (i > 0) walked += Math.sqrt((c.x - x) * (c.x - x) + (c.y - y) * (c.y - y));
    }
    // 50% would be 261/s; Wave 41's minimum is 410/s.
    expect(walked / 29).toBeCloseTo(410 / 30, 6);
  });

  it('Slow Slate sets a creep to 85% of its default speed, for good', () => {
    const s = arena();
    const t = tower(s, 'slow-slate', 40, 50);
    const c = creepNear(s, t, 'wave-9', 0, 0, 1e6);
    c.speed = 285 / 30;
    run(s, 1);
    expect(c.speed).toBeCloseTo((285 * 0.85) / 30, 9);
    run(s, 30);
    expect(c.speed).toBeCloseTo((285 * 0.85) / 30, 9);
    // …but not below its minimum: Wave 50's 522 × 0.85 = 443.7 is clamped to 445.
    const fast = creepNear(s, t, 'wave-50', 0, 0, 1e9);
    fast.speed = 522 / 30;
    run(s, 20);
    expect(fast.speed).toBeCloseTo(445 / 30, 9);
  });

  it('Fire Star marks; the mark burns the creep and its neighbours', () => {
    const s = arena();
    const t = tower(s, 'fire-star', 40, 50);
    const a = creepNear(s, t, 'wave-1', 3, 0, 1e6);
    const b = creepNear(s, t, 'wave-1', 4, 0, 1e6);
    run(s, 31);
    expect(a.status.some((x) => x.key === `gem:fire-mark:${t.id}`)).toBe(true);
    expect(a.hp).toBeLessThan(1e6);
    expect(b.hp).toBeLessThan(1e6);
  });
});

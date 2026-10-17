import { describe, expect, it } from 'vitest';
import { element } from '../../../src/sim';
import { hitCreep, newElementRun, onTopLane, placeTower, run, send } from './helpers';

// The rest of the tower families, one rule each. Towers stand at (17, 6),
// centre (1152, 448), 320 from the lane's top run. Creep Elements are picked
// so the Element table is 100% (earth `full-1`, fire `full-3`, dark `full-7`).

const X = 1152;
const AT = [17, 6] as const;

/** Steps until `c` has been hit, or `max` ticks. */
function untilHit(s: ReturnType<typeof newElementRun>, c: { hp: number; maxHp: number }, max = 40): void {
  const start = c.hp;
  for (let i = 0; i < max && c.hp === start; i++) run(s, 1);
}

describe('Element tower families', () => {
  it('Earth: the splash repeats at the spot 1 s later for half the hit, each half rounded', () => {
    const s = newElementRun();
    const t = placeTower(s, 'earth_tower', ...AT);
    const c = onTopLane(s, 'full-1', X, 100_000);
    untilHit(s, c);
    expect(c.hp).toBe(100_000 - 56);
    send(s, { type: 'element.sell', tower: t.id });
    run(s, 30);
    expect(c.hp).toBe(100_000 - 56 - 28);
  });

  it('Fire: its splash radii grow with each consecutive hit on one creep', () => {
    const s = newElementRun();
    placeTower(s, 'fire_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 1_000_000);
    const b = onTopLane(s, 'full-1', X + 250, 100_000);
    const c = onTopLane(s, 'full-1', X + 430, 100_000);
    untilHit(s, a);
    expect([1_000_000 - a.hp, 100_000 - b.hp, 100_000 - c.hp]).toEqual([30, 15, 0]);
    untilHit(s, c, 20);
    expect(100_000 - c.hp).toBe(15);
  });

  it('Water: one bounce to a creep near the target for a quarter, as the same split splash', () => {
    const s = newElementRun();
    placeTower(s, 'water_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 100_000);
    const b = onTopLane(s, 'full-1', X + 240, 100_000);
    run(s, 15);
    expect([100_000 - a.hp, 100_000 - b.hp]).toEqual([90, 22]);
  });

  it('Nature: +15% for each other creep within 125 of the target', () => {
    const s = newElementRun();
    placeTower(s, 'nature_tower', ...AT);
    const a = onTopLane(s, 'full-7', X, 100_000);
    onTopLane(s, 'full-7', X + 100, 100_000);
    onTopLane(s, 'full-7', X + 120, 100_000);
    untilHit(s, a);
    expect(100_000 - a.hp).toBe(104);
  });

  it('Disease: A × r × (1 + r/10) with r = max HP / HP', () => {
    const s = newElementRun();
    placeTower(s, 'disease_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 1000);
    a.hp = 500;
    untilHit(s, a);
    expect(500 - a.hp).toBe(336);
  });

  it('Laser: instant, 10% less per other creep within 100 of the target', () => {
    const s = newElementRun();
    placeTower(s, 'laser_tower', ...AT);
    const a = onTopLane(s, 'full-3', X, 1_000_000);
    onTopLane(s, 'full-3', X + 50, 1_000_000);
    onTopLane(s, 'full-3', X + 90, 1_000_000);
    run(s, 1);
    expect(1_000_000 - a.hp).toBe(4800);
  });

  it('Erosion: acid on the target and, by extra shots, on creeps near it: +15% taken and a DoT that ticks at once', () => {
    const s = newElementRun();
    const t = placeTower(s, 'erosion_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 100_000);
    const b = onTopLane(s, 'full-1', X + 300, 100_000);
    run(s, 1);
    expect(s.projectiles.map((p) => p.spec).sort()).toEqual(['erosion_tower', 'shot:acid-1']);
    send(s, { type: 'element.sell', tower: t.id });
    run(s, 10);
    expect([100_000 - a.hp, 100_000 - b.hp]).toEqual([115, 115]);
    expect(a.status.find((x) => x.key === element.ACID)!.value).toBe(15);
    run(s, 30);
    expect(100_000 - a.hp).toBe(230);
  });

  it('Jinx: marks creeps near the target, then deals 6% of the HP they lost since, every 2.5 s', () => {
    const s = newElementRun();
    const t = placeTower(s, 'jinx_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 1_000_000);
    untilHit(s, a);
    send(s, { type: 'element.sell', tower: t.id });
    expect(1_000_000 - a.hp).toBe(3500);
    run(s, 75);
    expect(1_000_000 - a.hp).toBe(3500 + 210);
  });

  it('Roots: a line toward the target slows and starts a stacking DoT that also ticks at once', () => {
    const s = newElementRun();
    const t = placeTower(s, 'roots_tower', ...AT);
    const a = onTopLane(s, 'full-7', X, 100_000);
    run(s, 1);
    send(s, { type: 'element.sell', tower: t.id });
    expect(100_000 - a.hp).toBe(100);
    expect(a.status.find((x) => x.key === element.slowKey('gaia'))).toMatchObject({ value: 0.12 });
    run(s, 150);
    expect(100_000 - a.hp).toBe(600);
  });

  it('Nova: every creep within 950 of the tower, and the explode slow within 900', () => {
    const s = newElementRun();
    placeTower(s, 'nova_tower', ...AT);
    const a = onTopLane(s, 'full-3', X, 100_000);
    run(s, 1);
    expect(100_000 - a.hp).toBe(300);
    expect(a.status.find((x) => x.key === element.slowKey('explode'))).toMatchObject({ value: 0.12 });
  });

  it('Windstorm: a tornado on the closest creep hits everything within 450 each second', () => {
    const s = newElementRun();
    placeTower(s, 'windstorm_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 100_000);
    run(s, 1);
    expect(s.mode.tornadoes).toHaveLength(1);
    expect(a.status.find((x) => x.key === element.slowKey('tornado'))).toBeDefined();
    run(s, 30);
    expect(100_000 - a.hp).toBe(600);
  });

  it('Enchantment: Faerie Fire on the highest-HP creep amplifies its damage taken, more when few are near', () => {
    const s = newElementRun();
    placeTower(s, 'enchantment_tower_3', ...AT);
    const a = onTopLane(s, 'full-1', X, 10_000_000);
    run(s, 1);
    expect(a.status.find((x) => x.key === element.FAERIE)).toMatchObject({ value: 3 });
    const before = a.hp;
    hitCreep(s, a, 100);
    expect(before - a.hp).toBe(240);
  });

  it('Polar: Frostbite takes 12% of current HP from the highest-HP creep and gives it back 10 s later', () => {
    const s = newElementRun();
    const t = placeTower(s, 'polar_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 1_000_000);
    run(s, 1);
    expect(a.hp).toBe(880_000);
    send(s, { type: 'element.sell', tower: t.id });
    run(s, 20);
    const hp = a.hp;
    run(s, 300);
    expect(a.hp).toBe(hp + 120_000);
  });

  it('Moss: each creep\'s share grows with its remaining HP fraction', () => {
    const s = newElementRun();
    placeTower(s, 'moss_tower', ...AT);
    const a = onTopLane(s, 'full-7', X, 1_000_000);
    const b = onTopLane(s, 'full-7', X + 150, 1000);
    b.hp = 500;
    untilHit(s, a);
    expect([1_000_000 - a.hp, 500 - b.hp]).toEqual([800, 300]);
  });

  it('Tidal: each hit within 2 s adds 45 damage and shrinks the splash', () => {
    const s = newElementRun();
    placeTower(s, 'tidal_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 1_000_000);
    untilHit(s, a);
    expect(1_000_000 - a.hp).toBe(600);
    untilHit(s, a);
    // 645 lands as two halves of 322.5, each rounded half up.
    expect(1_000_000 - a.hp).toBe(600 + 646);
  });

  it('Obliteration: full damage within 200 + 200/1150 × the distance', () => {
    const s = newElementRun();
    placeTower(s, 'obliteration_tower', ...AT);
    const a = onTopLane(s, 'full-1', X, 100_000);
    const b = onTopLane(s, 'full-1', X - 250, 100_000);
    const c = onTopLane(s, 'full-1', X + 270, 100_000);
    a.hp = b.hp = c.hp = 100_000;
    // Farthest first: b (250 left) stands at 406, c (270 right) at 419.
    untilHit(s, c, 30);
    expect([100_000 - b.hp, 100_000 - c.hp, 100_000 - a.hp]).toEqual([0, 1800, 1800]);
  });

  it('Impulse: distance / 1000 × 3,300', () => {
    const s = newElementRun();
    placeTower(s, 'impulse_tower', ...AT);
    const a = onTopLane(s, 'full-7', X, 100_000);
    untilHit(s, a);
    expect(100_000 - a.hp).toBe(1056);
  });

  it('Ephemeral: −10% damage a second while it keeps firing, then back to full', () => {
    const s = newElementRun();
    const t = placeTower(s, 'ephemeral_tower', ...AT);
    onTopLane(s, 'full-7', X, 1e12);
    const damage: number[] = [];
    for (let i = 0; i < 12; i++) {
      run(s, 30);
      damage.push(element.towerInfo(s, t.id)!.damage);
    }
    expect(Math.min(...damage)).toBeCloseTo(2000 * 0.4, 6);
    expect(damage.filter((d) => d === 2000).length).toBeGreaterThan(0);
  });

  it('Runic: its magic attack fires extra shots at creeps within 150 of the target', () => {
    const s = newElementRun();
    placeTower(s, 'runic_tower', ...AT);
    onTopLane(s, 'full-1', X, 1e9);
    onTopLane(s, 'full-1', X + 100, 1e9);
    run(s, 2);
    expect(s.projectiles.map((p) => p.spec).sort()).toEqual(['runic_tower', 'shot:runic']);
  });
});

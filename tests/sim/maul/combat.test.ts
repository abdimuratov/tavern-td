import { describe, expect, it } from 'vitest';
import { MAUL_DAMAGE_TABLE, MAUL_TOWERS, SLOW_KEY, type ArmorType, type AttackType } from '../../../src/content/maul';
import { creepMods, damageCreep, maul, type GameState } from '../../../src/sim';
import { creepAt, field, modeEvents, newRun, ofType, placeTower, run } from './helpers';

const sim = (state: GameState) => ({ state, rules: maul.MAUL_RULES as never, events: [] });

describe('damage', () => {
  it('runs through Maul\'s table: each attack type has a favourite armor, and Chaos treats all alike', () => {
    const s = newRun({ map: field() });
    const cases: [AttackType, string, number][] = [
      ['pierce', 'harpy', 1.5], ['pierce', 'golem', 0.5], ['siege', 'golem', 1.5], ['siege', 'snowling', 0.5],
      ['frost', 'raider', 1.5], ['magic', 'brute', 1.5], ['magic', 'golem', 0.5], ['chaos', 'golem', 1], ['chaos', 'warlord', 1],
    ];
    for (const [type, creep, mult] of cases) {
      const c = creepAt(s, creep, 300, 300, 10_000);
      const armor = s.map && maul.MAUL_RULES.creeps[creep]!.armor;
      const dealt = damageCreep(sim(s), c, 100, type, 0, 'attack');
      expect(dealt, `${type} on ${creep}`).toBeCloseTo((100 * mult) / (1 + 0.06 * armor), 9);
    }
    const rows = Object.values(MAUL_DAMAGE_TABLE);
    for (const armor of ['light', 'medium', 'heavy', 'fortified'] as ArmorType[]) {
      // Every armor type has an attack that hits it at 150% (or chaos at 100%).
      expect(Math.max(...rows.map((r) => r[armor]))).toBe(1.5);
    }
  });

  it('lets poison skip the table and armor', () => {
    const s = newRun({ map: field() });
    const golem = creepAt(s, 'golem', 300, 300, 1000);
    // 18 a second takes 18 HP a second off a Fortified creep with 4 armor.
    golem.status.push({ kind: 'poison', key: 'maul:venom', value: 18, ticks: 30, src: 0 });
    run(s, 30);
    expect(1000 - golem.hp).toBeCloseTo(18, 6);
  });
});

describe('Maul\'s effects', () => {
  it('Spores poison every ground creep where they burst, and Blight eats their armor too', () => {
    const s = newRun({ map: field() });
    placeTower(s, 'blight_pod', 2, 4);
    const near = creepAt(s, 'raider', 500, 340, 5000);
    const close = creepAt(s, 'raider', 560, 380, 5000);
    const far = creepAt(s, 'raider', 900, 340, 5000);
    const air = creepAt(s, 'harpy', 520, 340, 5000);
    run(s, 40);
    expect(near.status.find((st) => st.key === 'maul:spore')?.value).toBe(15);
    expect(close.status.some((st) => st.key === 'maul:spore')).toBe(true);
    expect(creepMods(close).armor).toBe(-4);
    expect(far.status.length + air.status.length).toBe(0);
  });

  it('Chain lightning jumps to the nearest creeps not yet struck, 15% weaker each jump', () => {
    const s = newRun({ map: field() });
    placeTower(s, 'chain_rune', 2, 4);
    const cs = [400, 520, 640, 760, 880, 1000].map((x) => creepAt(s, 'brute', x, 320, 10_000));
    const events = run(s, 1);
    const hits = ofType(events, 'hit');
    expect(hits.map((h) => h.creep)).toEqual(cs.slice(0, 5).map((c) => c.id));
    const ratio = hits.map((h) => h.damage / hits[0]!.damage);
    expect(ratio[1]).toBeCloseTo(0.85, 9);
    expect(ratio[4]).toBeCloseTo(0.85 ** 4, 9);
    expect(modeEvents(events, 'maul.chain')[0]!.data).toMatchObject({ points: expect.any(Array) });
  });
});

describe('slows', () => {
  it('share one key, so only the strongest counts', () => {
    const s = newRun({ map: field() });
    placeTower(s, 'rime_totem', 6, 4);
    placeTower(s, 'frost_lance', 2, 4);
    const c = creepAt(s, 'raider', 7 * 64, 6 * 64, 10_000);
    run(s, 30);
    expect(c.status.filter((st) => st.key === SLOW_KEY).length).toBeGreaterThanOrEqual(1);
    expect(creepMods(c).slow).toBeCloseTo(0.35, 9);
  });

  it('can\'t touch a Wraith, and slow a boss to half its speed at most', () => {
    const s = newRun({ map: field() });
    // Both stand on the exit's rows, so they walk straight east.
    const w = creepAt(s, 'wraith', 5.5 * 64, 5.5 * 64, 1e6);
    const b = creepAt(s, 'warlord', 5.5 * 64, 6.5 * 64, 1e6);
    w.speed = 240 / 30;
    b.speed = 170 / 30;
    for (const c of [w, b]) c.status.push({ kind: 'slow', key: SLOW_KEY, value: 0.9, ticks: 300, src: 0 });
    run(s, 30);
    expect(w.x - 5.5 * 64).toBeCloseTo(240, 6);
    expect(b.x - 5.5 * 64).toBeCloseTo(85, 6);
  });
});

describe('creeps', () => {
  it('Trolls heal 2% of their max HP a second', () => {
    const s = newRun({ map: field() });
    const t = creepAt(s, 'troll', 300, 300, 1000);
    t.hp = 500;
    run(s, 30);
    expect(t.hp).toBeCloseTo(520, 6);
  });

  it('tower auras lift nearby towers: a Ley Shrine adds damage and attack speed', () => {
    const s = newRun({ map: field() });
    const shrine = placeTower(s, 'ley_shrine', 6, 4);
    const rune = placeTower(s, 'spark_rune', 9, 4);
    const far = placeTower(s, 'spark_rune', 20, 0);
    run(s, 1);
    expect(maul.towerActions(s, rune.id)).toMatchObject({ damageBonus: 0.25, speedBonus: 0.15 });
    expect(maul.towerActions(s, far.id)).toMatchObject({ damageBonus: 0, speedBonus: 0 });
    expect(maul.towerActions(s, shrine.id)!.auraRadius).toBe(300);
    expect(MAUL_TOWERS['ley_shrine']!.auras).toHaveLength(2);
  });
});

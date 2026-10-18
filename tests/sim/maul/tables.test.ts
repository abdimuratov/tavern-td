import { describe, expect, it } from 'vitest';
import {
  AIR_WAVES, MAUL_CREEPS, MAUL_MAP, MAUL_TOWERS, MAUL_WAVES, RACE_SPECS, RACES, TOWER_FOOTPRINT,
} from '../../../src/content/maul';
import { airRoute, allRouteCells, cellCol, cellRow, maul, validateMap } from '../../../src/sim';
import { newRun } from './helpers';

describe('the Crossing', () => {
  it('is a valid Map with two gates, the Ford, two Posts and an exit', () => {
    expect(validateMap(MAUL_MAP)).toBeNull();
    expect(MAUL_MAP.spawns).toHaveLength(2);
    expect(MAUL_MAP.waypoints).toHaveLength(4);
    expect([MAUL_MAP.cols, MAUL_MAP.rows]).toEqual([48, 32]);
  });

  it('sends both gates\' creeps through the Ford, then past the West and East Posts to the exit', () => {
    const s = newRun();
    const routes = allRouteCells(s);
    for (const route of routes) {
      const at = (cell: number): [number, number] => [cellCol(s.map, cell), cellRow(s.map, cell)];
      expect(at(route[0]!)[1]).toBe(0);
      expect(at(route[route.length - 1]!)[1]).toBe(31);
      // Every waypoint is visited in order.
      let seg = 0;
      for (const c of route) if (seg < 4 && MAUL_MAP.waypoints[seg]!.some(([col, row]) => col === at(c)[0] && row === at(c)[1])) seg++;
      expect(seg).toBe(4);
    }
    // Flyers go straight from each gate to the Ford, then Post to Post to the exit.
    const air = airRoute(s, 1);
    expect(air).toHaveLength(5);
    expect(air[1]).toEqual({ x: 24 * 64, y: 13 * 64 });
  });
});

describe('the Races', () => {
  it('each have a Wall and two lines that climb to Tier 2 and fork at Tier 3: nine towers a Race', () => {
    for (const race of RACES) {
      const towers = Object.entries(MAUL_TOWERS).filter(([, t]) => t.maul.race === race);
      expect(towers).toHaveLength(9);
      const [wall, a1, b1] = RACE_SPECS[race].builds;
      expect(MAUL_TOWERS[wall]!.maul).toMatchObject({ tier: 0, total: 10, next: [a1, b1] });
      for (const t1 of [a1, b1]) {
        const one = MAUL_TOWERS[t1]!.maul;
        expect(one.tier).toBe(1);
        const two = MAUL_TOWERS[one.next[0]!]!.maul;
        expect(two.tier).toBe(2);
        expect(two.next).toHaveLength(2);
        for (const fork of two.next) {
          const three = MAUL_TOWERS[fork]!.maul;
          expect(three).toMatchObject({ tier: 3, next: [], line: one.line });
          expect(three.total).toBe(two.total + three.price);
        }
        expect(two.total).toBe(one.total + two.price);
        expect(one.total).toBe(10 + one.price);
      }
    }
  });

  it('price Tier 1 at about 0.10 DPS a gold, every tower 2 × 2, and nothing that hits only air', () => {
    for (const [id, t] of Object.entries(MAUL_TOWERS)) {
      expect(t.footprint, id).toBe(TOWER_FOOTPRINT);
      expect(t.cost, id).toBe(t.maul.total);
      expect(t.attack?.targets, id).not.toBe('air');
    }
    for (const id of ['ballista', 'spark_rune']) {
      const a = MAUL_TOWERS[id]!.attack!;
      expect((a.damage[0] + a.damage[1]) / 2 / a.cooldown / MAUL_TOWERS[id]!.cost).toBeCloseTo(0.1, 2);
    }
  });
});

describe('the Waves', () => {
  it('are 40, with a boss every tenth and air at Wintermaul\'s uneven gaps', () => {
    expect(MAUL_WAVES).toHaveLength(40);
    const bosses = MAUL_WAVES.flatMap((w, i) => (MAUL_CREEPS[w.creep]!.maul.kind === 'boss' ? [i + 1] : []));
    expect(bosses).toEqual([10, 20, 30, 40]);
    expect(AIR_WAVES).toEqual([5, 14, 23, 27, 34, 38]);
    // Every creep is used, and each kind first comes alone.
    for (const id of Object.keys(MAUL_CREEPS)) expect(MAUL_WAVES.some((w) => w.creep === id || w.escort?.creep === id), id).toBe(true);
  });

  it('call three creeps the Brawler, Sleet Hound and Hollow, under the ids saves and replays already hold', () => {
    expect(['raider', 'frost_wolf', 'wraith'].map((id) => MAUL_CREEPS[id]!.name)).toEqual(['Brawler', 'Sleet Hound', 'Hollow']);
  });

  it('are previewed with air and boss tags, both gates, HP with Difficulty, bounty and bonus', () => {
    const s = newRun({ difficulty: 'hard' });
    const air = maul.wavePreview(s, 5)!;
    expect(air).toMatchObject({ air: true, boss: false, spawns: [0, 1], bounty: 40, bonus: 40 });
    expect(air.groups[0]).toMatchObject({ creep: 'harpy', count: 16, flying: true, armorType: 'light' });
    expect(air.groups[0]!.hp).toBe(Math.round(8 * 1.12 ** 4 * 0.6 * 1.3));
    const boss = maul.wavePreview(s, 10)!;
    expect(boss.boss).toBe(true);
    expect(boss.groups.map((g) => [g.creep, g.count])).toEqual([['warlord', 2], ['raider', 10]]);
    expect(maul.wavePreview(s, 41)).toBeNull();
  });
});

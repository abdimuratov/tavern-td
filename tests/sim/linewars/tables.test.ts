import { describe, expect, it } from 'vitest';
import {
  EXIT_ROW, FIELD_COLS, FIELD_ROWS, LW_CREEPS, LW_MAP, LW_SENDS, SEND_IDS, SEND_LIST, fieldOfCol,
} from '../../../src/content/linewars';
import { MAUL_CREEPS, MAUL_TOWERS } from '../../../src/content/maul';
import { CELL, airRoute, allRouteCells, cellCol, cellRow, linewars, step, validateMap } from '../../../src/sim';
import { at, col, creepIn, newRun, placeTower } from './helpers';

describe('the Twin Fields', () => {
  it('is a valid 44 × 32 Map: two 16 × 28 Fields, 12 columns of rock between, spawns along the top and the exit along the bottom', () => {
    expect(validateMap(LW_MAP)).toBeNull();
    expect([LW_MAP.cols, LW_MAP.rows]).toEqual([44, 32]);
    expect(LW_MAP.waypoints).toHaveLength(1);
    expect(LW_MAP.spawns).toHaveLength(32);
    // Yours first: Side 0's sixteen, then the Rival's.
    expect(LW_MAP.spawns!.slice(0, 16).every(([c, r]) => fieldOfCol(c) === 0 && r === 0)).toBe(true);
    expect(LW_MAP.spawns!.slice(16).every(([c, r]) => fieldOfCol(c) === 1 && r === 0)).toBe(true);
    expect(LW_MAP.spawn).toEqual(LW_MAP.spawns![0]);
    expect(LW_MAP.waypoints[0]!.every(([, r]) => r === EXIT_ROW)).toBe(true);
    for (let r = 0; r < LW_MAP.rows; r++) {
      const line = LW_MAP.terrain[r]!;
      expect(line.slice(16, 28)).toBe('#'.repeat(12));
      const open = r >= FIELD_ROWS[0] && r <= FIELD_ROWS[1];
      for (const side of [0, 1] as const) expect(line.slice(FIELD_COLS[side][0], FIELD_COLS[side][1] + 1)).toBe((open ? '.' : ',').repeat(16));
    }
  });

  it('joins the Fields by no walkable cell, so each Field\'s creeps reach only its own exit', () => {
    const s = newRun();
    const routes = allRouteCells(s);
    routes.forEach((route, spawn) => {
      const side = spawn < 16 ? 0 : 1;
      const last = route[route.length - 1]!;
      expect(cellRow(s.map, last)).toBe(EXIT_ROW);
      expect(route.every((c) => fieldOfCol(cellCol(s.map, c)) === side)).toBe(true);
    });
    // Flyers make straight for the middle of their own Field's exit row.
    expect(airRoute(s, 3).at(-1)).toEqual({ x: 36 * CELL, y: (EXIT_ROW + 0.5) * CELL });
    expect(airRoute(s, 20).at(-1)).toEqual({ x: 8 * CELL, y: (EXIT_ROW + 0.5) * CELL });
  });
});

describe('the Sends', () => {
  it('are the ten of the design, cheapest first, with its names, hotkeys and Maul\'s creeps', () => {
    expect(SEND_LIST.map((s) => s.id)).toEqual([...SEND_IDS]);
    expect(SEND_LIST.map((s) => s.name)).toEqual([
      'Snowlings', 'Brawler', 'Sleet Hound', 'Troll', 'Hollow', 'Brute', 'Harpies', 'Ice Golem', 'Tusked Warlord', 'War Mammoth',
    ]);
    expect(SEND_LIST.map((s) => s.key).join('')).toBe('ZXCVBADFGH');
    expect(SEND_LIST.map((s) => s.unlock)).toEqual([20, 40, 80, 120, 180, 240, 300, 360, 480, 600]);
    for (const s of SEND_LIST) {
      expect(Object.hasOwn(MAUL_CREEPS, s.creep), s.id).toBe(true);
      expect(Number.isInteger(s.count) && s.count >= 1, s.id).toBe(true);
      for (const v of [s.price, s.income, s.hp, s.cap, s.restock]) expect(v, s.id).toBeGreaterThan(0);
      expect(s.bounty, s.id).toBeGreaterThanOrEqual(1);
      expect(s.steals, s.id).toBeGreaterThanOrEqual(1);
      expect(s.count * s.bounty, s.id).toBeLessThan(s.price);
      // Its creep is Maul's, with the Send's HP, steal and no core bounty.
      const c = LW_CREEPS[s.creep]!;
      expect(c).toMatchObject({ hp: s.hp, bounty: 0, leakCost: s.steals, lw: { send: s.id } });
      const m = MAUL_CREEPS[s.creep]!;
      expect([c.armor, c.armorType, c.speed, c.flying]).toEqual([m.armor, m.armorType, m.speed, m.flying]);
    }
    expect([LW_SENDS.warlord.steals, LW_SENDS.mammoth.steals]).toEqual([2, 3]);
  });

  it('rename three of Maul\'s creeps for Line Wars only: Brawler, Sleet Hound and Hollow', () => {
    expect([LW_CREEPS['raider']!.name, LW_CREEPS['frost_wolf']!.name, LW_CREEPS['wraith']!.name]).toEqual(['Brawler', 'Sleet Hound', 'Hollow']);
    expect([MAUL_CREEPS['raider']!.name, MAUL_CREEPS['frost_wolf']!.name, MAUL_CREEPS['wraith']!.name]).toEqual(['Raider', 'Frost Wolf', 'Wraith']);
  });

  it('trade income for pressure: the income ratio falls and HP per gold rises with price, and flyers return half', () => {
    const ground = SEND_LIST.filter((s) => s.id !== 'harpies');
    const perGold = (s: (typeof SEND_LIST)[number]): number => (s.hp * s.count) / s.price;
    for (let i = 1; i < ground.length; i++) {
      const [a, b] = [ground[i - 1]!, ground[i]!];
      expect(b.income / b.price, b.id).toBeLessThanOrEqual(a.income / a.price + 1e-9);
      expect((b.bounty * b.count) / b.price, b.id).toBeLessThanOrEqual((a.bounty * a.count) / a.price + 1e-9);
    }
    // The fast Sleet Hound trades a little HP for its speed.
    const sturdy = ground.filter((s) => s.id !== 'sleet_hound');
    for (let i = 1; i < sturdy.length; i++) expect(perGold(sturdy[i]!), sturdy[i]!.id).toBeGreaterThanOrEqual(perGold(sturdy[i - 1]!) - 1e-9);
    expect(perGold(LW_SENDS.sleet_hound)).toBeGreaterThan(perGold(LW_SENDS.snowlings));
    const ratio = (id: keyof typeof LW_SENDS): number => LW_SENDS[id].income / LW_SENDS[id].price;
    expect(ratio('harpies')).toBeLessThanOrEqual(((ratio('brute') + ratio('ice_golem')) / 2) * 0.5 + 1e-9);
  });
});

describe('the Divide', () => {
  // A creep in a Field stands on its cells, so the nearest any creep of one
  // Field can be to anything of the other is the Divide's width; a 2 × 2
  // tower's centre stands a cell further in.
  const divide = (FIELD_COLS[0][0] - FIELD_COLS[1][1] - 1) * CELL;
  const reach = divide + CELL;

  it('is wider than every tower\'s range, aura, splash, spores and chain, so no tower can touch the other Field', () => {
    expect([divide, reach]).toEqual([768, 832]);
    for (const [id, t] of Object.entries(MAUL_TOWERS)) {
      const a = t.attack;
      if (a) expect(a.range, id).toBeLessThan(reach);
      for (const aura of t.auras ?? []) expect(aura.radius, id).toBeLessThan(reach);
      for (const e of a?.effects ?? []) {
        const x = e as { kind: string; bands?: readonly (readonly [number, number])[]; radius?: number; jumps?: number };
        if (x.kind === 'splash') expect(x.bands!.at(-1)![0], id).toBeLessThan(divide);
        if (x.kind === 'maul.spread' || x.kind === 'maul.chain') expect(x.radius!, id).toBeLessThan(divide);
      }
    }
  });

  it('keeps the longest-reaching tower at the Rival\'s inner edge off a creep at the inner edge of yours', () => {
    const s = newRun();
    // A Bombard (800) and a Shatter Totem (300 aura) on the Rival's cells beside the Divide.
    const bombard = placeTower(s, 'bombard', col(1, 14), 14);
    placeTower(s, 'shatter_totem', col(1, 14), 18);
    const creep = creepIn(s, 0, 'brute', 28 * CELL + 1, 15 * CELL);
    expect(linewars.creepField(creep)).toBe(0);
    for (let i = 0; i < 90; i++) step(s, []);
    expect(bombard.target).toBe(0);
    expect(creep.status).toEqual([]);
    expect(creep.hp).toBe(creep.maxHp);
    // The same creep in the Rival's own Field is hit at once.
    const near = creepIn(s, 1, 'brute', at(col(1, 6), 15).x, at(col(1, 6), 15).y);
    for (let i = 0; i < 120 && near.hp === near.maxHp; i++) step(s, []);
    expect(near.hp).toBeLessThan(near.maxHp);
  });
});

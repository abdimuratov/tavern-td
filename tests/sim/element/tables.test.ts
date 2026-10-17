import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOSS_HP_BASE, BUILDABLE, DAMAGE_TABLE, ELEMENTS, ELEMENT_CREEPS, ELEMENT_EXPRESS_WAVES, ELEMENT_FULL_WAVES, ELEMENT_MAP,
  ELEMENT_ROUTE, ELEMENT_SHOTS, ELEMENT_TOWERS, ESSENCE_AFTER, EXPRESS_LEVEL_GATES, HULL, LEAK_RADIUS, LUMBER_AFTER, SELL,
  START, START_LIVES, damageMultiplier, elementalId,
  type DamageElement,
} from '../../../src/content/element';
import { effectHandler, element, getMode, routeData, validateMap } from '../../../src/sim';
import { newElementRun } from './helpers';

// The content tables against element-data.json, the machine-readable twin of
// docs/research/element-td-rules.md (a trimmed copy sits next to this test).

interface DataTower {
  id: string; kind: string; level: number; cost: number; totalCost: number; essenceCost: number; damage: number;
  cooldown: number; range: number; projectileSpeed: number | null; elements: string[]; damageElement: string; support: boolean;
  aoeFull: number | null; aoeHalf: number | null; buffPriority: number | null; buildTime: number;
  requirements: Record<string, number>; upgradesTo: string[];
}
interface DataWave {
  wave: number; unit: string; element: string; trait: string | null; hpBase: number; count: number; spawnInterval: number;
  hp: Record<string, number | number[]>; bountyEach: Record<string, number>; breakBefore: Record<string, number>;
  lumberBeforeThisWave: boolean; essenceBeforeThisWave: boolean;
}
interface Data {
  map: { cols: number; rows: number; rowsText: string[]; route: { x: number; y: number }[]; routeLength: number; leakRadius: number };
  damageTable: Record<string, Record<string, number>>;
  towers: DataTower[];
  waves: { classic: DataWave[]; express: DataWave[] };
  elementals: { baseHp: number[]; speed: number; bounty: number; livesPerLeak: number };
  lumber: { classic: { start: number; grantedAfterWaves: number[] }; express: { start: number; grantedAfterWaves: number[] } };
  economy: { startGold: Record<string, number>; startLumber: Record<string, number>; lives: number; sell: Record<string, number> };
  buffPriority: Record<string, number>;
}

const data = JSON.parse(readFileSync(new URL('./element-data.json', import.meta.url), 'utf8')) as Data;
const DIFFS = [['normal', 'Normal'], ['hard', 'Hard'], ['insane', 'Insane']] as const;

describe('Element content', () => {
  it('registers as a Game Mode whose tables pass the core checks', () => {
    expect(getMode('element').id).toBe('element');
    for (const [id, t] of Object.entries({ ...ELEMENT_TOWERS, ...ELEMENT_SHOTS })) {
      for (const e of t.attack?.effects ?? []) expect(effectHandler(e.kind), `${id}: ${e.kind}`).toBeDefined();
    }
  });

  it('has all 144 towers with the port\'s stats, costs, requirements and upgrade tree', () => {
    expect(Object.keys(ELEMENT_TOWERS)).toHaveLength(144);
    expect(data.towers).toHaveLength(144);
    for (const d of data.towers) {
      const t = ELEMENT_TOWERS[d.id];
      expect(t, d.id).toBeDefined();
      const info = t!.element;
      expect(t!.cost, d.id).toBe(d.cost);
      expect(t!.footprint).toBe(2);
      expect(info).toMatchObject({
        kind: d.kind, level: d.level, totalCost: d.totalCost, essence: d.essenceCost, baseDamage: d.damage, cooldown: d.cooldown,
        range: d.range, damage: d.damageElement, support: d.support, buffPriority: d.buffPriority, buildTime: d.buildTime,
        requires: d.requirements, upgrades: d.upgradesTo, elements: d.elements,
      });
      expect(info.splash, d.id).toEqual(d.aoeFull ? { full: d.aoeFull, half: d.aoeHalf } : null);
      if (t!.attack) {
        expect(t!.attack.damage).toEqual([d.damage, d.damage]);
        expect(t!.attack.range).toBe(d.range + HULL);
        expect(t!.attack.attackType).toBe(d.damageElement);
        expect(t!.attack.direct).toBe(false);
      }
      // Our own names, never the port's unit names.
      expect(t!.name.toLowerCase()).not.toContain('_');
    }
    // Every upgrade costs the target's Cost, and the totals add up.
    for (const d of data.towers) for (const to of d.upgradesTo) expect(ELEMENT_TOWERS[to]!.element.totalCost).toBe(d.totalCost + ELEMENT_TOWERS[to]!.cost!);
  });

  it('builds Arrow, Cannon, the six level-1 singles and the Periodic tower from nothing', () => {
    expect([...BUILDABLE].sort()).toEqual(['basic_arrow_tower', 'basic_cannon_tower', ...ELEMENTS.map((e) => `${e}_tower`), 'periodic_tower'].sort());
    expect(ELEMENT_TOWERS['periodic_tower']!.element).toMatchObject({ essence: 1, buildTime: 6 });
    expect(ELEMENT_TOWERS['pure_fire_tower']!.element).toMatchObject({ essence: 1, totalCost: 13000, range: 900 });
  });

  it('carries the abilities\' per-level values', () => {
    const hit = (id: string) => ELEMENT_TOWERS[id]!.attack!.effects![0]! as unknown as Record<string, unknown>;
    expect(hit('light_tower')).toMatchObject({ kind: 'element.light', bonus: 5 });
    expect(hit('pure_light_tower')).toMatchObject({ bonus: 2500 });
    expect(hit('electricity_tower_3')).toMatchObject({ damage: 6000, jumps: 7, radius: 300 });
    expect(hit('poison_tower_2')).toMatchObject({ perTick: 200, every: 0.5, duration: 10, full: 150, half: 300 });
    expect(hit('hail_tower_3')).toMatchObject({ chance: 0.25, every: 12, multiplier: 5 });
    expect(hit('quake_tower_2')).toMatchObject({ damage: 9000, pct: 2.5, radius: 550, every: 5 });
    expect(hit('roots_tower_3')).toMatchObject({ dps: 2500, slow: 0.52, count: 6 });
    expect(hit('tidal_tower_3')).toMatchObject({ full: 300, half: 600, bonus: 675 });
    expect(hit('basic_cannon_tower')).toMatchObject({ mode: 'ground', full: 100, half: 200 });
    expect(ELEMENT_TOWERS['blacksmith_tower_3']!.element.ability).toMatchObject({ kind: 'fireUp', value: 1, duration: 60, cooldown: 15 });
    expect(ELEMENT_TOWERS['trickery_tower_2']!.element.ability).toMatchObject({ kind: 'conjure', duration: 20, anyTower: false });
    expect(ELEMENT_TOWERS['enchantment_tower_2']!.element.ability).toMatchObject({ base: 23, max: 42 });
    expect(ELEMENT_TOWERS['vapor_tower_3']!.element.ability).toMatchObject({ kind: 'pulse', base: 1500, perCreep: 750, radius: 600 });
    expect(ELEMENT_TOWERS['windstorm_tower']!.element.ability).toMatchObject({ kind: 'tornado', damage: 600, cooldown: 5 });
    expect(ELEMENT_TOWERS['vapor_tower']!.attack).toBeUndefined();
    expect(ELEMENT_TOWERS['windstorm_tower']!.attack).toBeUndefined();
  });

  it('has the six-Element damage cycle: 200% forward, 50% back, 90% into Composite, Composite 100% into all', () => {
    const all: DamageElement[] = [...ELEMENTS, 'composite'];
    for (const a of all) {
      for (const c of all) {
        const expected = data.damageTable[a]?.[c] ?? 1;
        expect(damageMultiplier(a, c), `${a} → ${c}`).toBe(expected);
      }
    }
    const cycle: DamageElement[] = ['water', 'fire', 'nature', 'earth', 'light', 'dark'];
    cycle.forEach((e, i) => {
      expect(DAMAGE_TABLE[e][cycle[(i + 1) % 6]!]).toBe(2);
      expect(DAMAGE_TABLE[e][cycle[(i + 5) % 6]!]).toBe(0.5);
      expect(DAMAGE_TABLE[e].composite).toBe(0.9);
    });
  });

  it('has the 55 Full and 30 Express Waves with the port\'s HP, counts, bounty, breaks and grants per Difficulty', () => {
    const check = (ours: typeof ELEMENT_FULL_WAVES, theirs: DataWave[]): void => {
      expect(ours).toHaveLength(theirs.length);
      theirs.forEach((d, i) => {
        const w = ours[i]!;
        expect(w).toMatchObject({
          wave: d.wave, unit: d.unit, element: d.element, trait: d.trait, hpBase: d.hpBase, count: d.count, interval: d.spawnInterval,
          lumber: d.lumberBeforeThisWave, essence: d.essenceBeforeThisWave,
        });
        for (const [ours2, theirs2] of DIFFS) {
          expect(w.hp[ours2], `Wave ${d.wave} ${ours2}`).toBe(d.hp[theirs2]);
          expect(w.bounty[ours2]).toBe(d.bountyEach[theirs2]);
          expect(w.breakBefore[ours2]).toBe(d.breakBefore[theirs2]);
        }
        // Easy: Normal's bounty and breaks, HP × 0.75 floored (bulky doubled after).
        expect(w.bounty.easy).toBe(d.bountyEach['Normal']);
        expect(w.hp.easy).toBe(Math.floor(d.hpBase * 0.75) * (d.trait === 'bulky' ? 2 : 1));
        const creep = ELEMENT_CREEPS[w.creep]!;
        expect(creep).toMatchObject({ armorType: d.element, trait: d.trait, speed: 300, flying: false });
      });
    };
    check(ELEMENT_FULL_WAVES, data.waves.classic.slice(0, 55));
    check(ELEMENT_EXPRESS_WAVES, data.waves.express);
  });

  it('grows the endless boss Waves ×1.3 from the port\'s base', () => {
    const boss = data.waves.classic[55]!;
    expect(boss.hpBase).toBe(BOSS_HP_BASE);
    for (const [ours, theirs] of DIFFS) {
      (boss.hp[theirs] as number[]).forEach((hp, i) => expect(element.bossHp(ours, i + 1, false), `${ours} boss ${i + 1}`).toBe(hp));
    }
    const groups = element.bossGroups('normal', 1);
    expect(groups).toHaveLength(26);
    expect(groups.filter((g) => g.creep === 'boss-bulky')).toHaveLength(4);
    expect(groups[0]).toMatchObject({ creep: 'boss-bulky', delay: 0.5, hp: 499298 * 2 });
    expect(groups[1]).toMatchObject({ creep: 'boss-heal', delay: 1.5 });
  });

  it('has the Elementals, the Lumber and essence Waves, and the starting economy', () => {
    for (const e of ELEMENTS) {
      for (let l = 1; l <= 3; l++) {
        const c = ELEMENT_CREEPS[elementalId(e, l)]!;
        expect(c).toMatchObject({ armorType: e, hp: data.elementals.baseHp[l - 1], speed: data.elementals.speed, elemental: { element: e, level: l } });
      }
    }
    expect(LUMBER_AFTER.full).toEqual(data.lumber.classic.grantedAfterWaves);
    expect(LUMBER_AFTER.express).toEqual(data.lumber.express.grantedAfterWaves);
    expect(EXPRESS_LEVEL_GATES).toEqual({ 2: 6, 3: 15 });
    expect(ESSENCE_AFTER).toEqual({ full: [50, 55], express: [24, 27] });
    expect(START.full).toMatchObject({ gold: data.economy.startGold['full'], lumber: data.economy.startLumber['full'] });
    expect(START.express).toMatchObject({ gold: data.economy.startGold['express'], lumber: data.economy.startLumber['express'] });
    expect(START_LIVES).toBe(data.economy.lives);
    expect(SELL).toEqual({ normal: 0.9, arrowCannon: 0.98, random: 1 });
    // Elementals take Wave 1–4 HP at the start, ×1.5 per 5 Waves after (Normal).
    const s = newElementRun();
    expect(element.elementalHp(s, 1)).toBe(600);
    expect(element.elementalHp(s, 3)).toBe(15000);
  });

  it('keeps the BuffPriority table', () => {
    for (const [id, p] of Object.entries(data.buffPriority)) expect(ELEMENT_TOWERS[id]!.element.buffPriority, id).toBe(p);
  });

  it('has the 56 × 40 Map with the lane, plots and the 12-corner route', () => {
    expect(validateMap(ELEMENT_MAP)).toBeNull();
    const terrain = data.map.rowsText.map((r) => r.replace(/[^.#,]/g, ','));
    expect(ELEMENT_MAP.terrain).toEqual(terrain);
    expect(ELEMENT_ROUTE.map(([x, y]) => ({ x, y }))).toEqual(data.map.route.map((p) => ({ x: p.x, y: p.y })));
    const route = routeData(ELEMENT_MAP)!;
    expect(route.length).toBe(data.map.routeLength);
    expect(LEAK_RADIUS).toBe(data.map.leakRadius);
    expect(route.leakAt).toBe(data.map.routeLength - data.map.leakRadius);
    const count = (ch: string) => ELEMENT_MAP.terrain.join('').split(ch).length - 1;
    expect(count('.')).toBe(592);
    expect(count(',')).toBe(460);
  });
});

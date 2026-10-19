import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LENGTH, DAMAGE_TABLE, FAMILIES, FAMILY_BASE, LEVEL_XP, MILL_ROAD, ORIGINAL_CREEPS, ORIGINAL_TOWERS, PERKS, ROW_COST,
  STAGES, TALENTS, talentTree,
} from '../../../src/content/original';
import { effectHandler, getMode, original, routeData, validateMap } from '../../../src/sim';

describe('the Original\'s content', () => {
  it('registers as a Game Mode with 30 towers and 13 creeps', () => {
    const rules = getMode('original');
    expect(Object.keys(rules.towers)).toHaveLength(30);
    expect(Object.keys(rules.creeps)).toHaveLength(13);
    expect(effectHandler('original.attack')).toBeDefined();
  });

  it('gives each family Tiers 1–3 then two Specialisations, with totals that add up', () => {
    for (const family of FAMILIES) {
      const t1 = FAMILY_BASE[family];
      const chain = [t1];
      let spec = ORIGINAL_TOWERS[t1]!;
      expect(spec.original.tier).toBe(1);
      while (spec.original.next.length === 1) {
        const next = spec.original.next[0]!;
        const n = ORIGINAL_TOWERS[next]!;
        expect(n.original.tier).toBe(spec.original.tier + 1);
        expect(n.original.total).toBe(spec.original.total + n.original.price);
        chain.push(next);
        spec = n;
      }
      expect(spec.original.tier).toBe(3);
      expect(spec.original.next).toHaveLength(2);
      for (const s of spec.original.next) {
        const sp = ORIGINAL_TOWERS[s]!;
        expect(sp.original.tier).toBe(4);
        expect(sp.original.next).toEqual([]);
        expect(sp.original.total).toBe(spec.original.total + sp.original.price);
        expect(sp.original.family).toBe(family);
      }
      expect(chain).toHaveLength(3);
    }
  });

  it('matches the design doc\'s prices and stats', () => {
    const row = (id: string): [number, number, number, number, number] => {
      const t = ORIGINAL_TOWERS[id]!;
      return [t.original.price, t.original.total, t.attack?.damage[0] ?? 0, t.attack?.cooldown ?? 0, t.attack?.range ?? 0];
    };
    expect(row('arrow_tower')).toEqual([70, 70, 6, 0.85, 320]);
    expect(row('marksman_tower')).toEqual([165, 345, 26, 0.85, 384]);
    expect(row('deadeye_perch')).toEqual([250, 595, 72, 2.2, 576]);
    expect(row('great_bombard')).toEqual([210, 440, 52, 1.8, 320]);
    expect(row('thunder_mortar')).toEqual([300, 740, 115, 3, 640]);
    expect(row('rime_lance')).toEqual([270, 650, 55, 1.4, 352]);
    expect(row('archmage_tower')).toEqual([225, 475, 70, 1.7, 352]);
    expect(row('prism_tower')).toEqual([330, 805, 60, 1.5, 352]);
    expect(row('venom_spire')).toEqual([180, 380, 7, 1, 352]);
    expect(row('widows_fang')).toEqual([270, 650, 10, 0.8, 352]);
    expect(row('storm_totem')).toEqual([300, 725, 60, 1.5, 320]);
    expect(ORIGINAL_TOWERS['war_totem']!.attack).toBeUndefined();
    // The beam's 40 per second lands in tenths.
    expect(ORIGINAL_TOWERS['arcane_lance']!.attack!.damage[0] / ORIGINAL_TOWERS['arcane_lance']!.attack!.cooldown).toBeCloseTo(40, 9);
    // Cannon and Poison are ground only, but Flak Battery hits air.
    expect(ORIGINAL_TOWERS['bombard']!.attack!.targets).toBe('ground');
    expect(ORIGINAL_TOWERS['flak_battery']!.attack!.targets).toBe('both');
    expect(ORIGINAL_TOWERS['venom_dart']!.attack!.targets).toBe('ground');
    // Single-target Tier 1 is 0.10 DPS per gold.
    expect(6 / 0.85 / 70).toBeCloseTo(0.1, 2);
  });

  it('has the damage table of §4, where nothing is immune and Poison ignores armor types', () => {
    expect(DAMAGE_TABLE.pierce).toEqual({ unarmored: 1, armored: 0.5, warded: 1, boss: 0.7 });
    expect(DAMAGE_TABLE.siege).toEqual({ unarmored: 1, armored: 0.75, warded: 1, boss: 0.85 });
    expect(DAMAGE_TABLE.magic).toEqual({ unarmored: 1, armored: 1, warded: 0.5, boss: 0.7 });
    expect(DAMAGE_TABLE.poison).toEqual({ unarmored: 1, armored: 1, warded: 1, boss: 1 });
    for (const row of Object.values(DAMAGE_TABLE)) for (const v of Object.values(row)) expect(v).toBeGreaterThanOrEqual(0.5);
  });

  it('has the ten creeps and three bosses of §5', () => {
    const c = ORIGINAL_CREEPS;
    expect(Object.keys(c)).toEqual([
      'ghoul', 'hound', 'crawler', 'bloodbat', 'revenant', 'cultist', 'flesh_golem', 'bloater', 'shieldbearer', 'gargoyle',
      'gravelord', 'plague_mother', 'riftlord',
    ]);
    expect(c['hound']).toMatchObject({ speed: 260, armorType: 'unarmored', original: { hpMult: 0.7, perWave: 10, gap: 0.8, xp: 2 } });
    expect(c['revenant']).toMatchObject({ armorType: 'armored', leakCost: 2, original: { hpMult: 3 } });
    expect(c['cultist']!.armorType).toBe('warded');
    expect(c['bloodbat']!.flying).toBe(true);
    expect(c['gargoyle']).toMatchObject({ flying: true, armorType: 'armored' });
    expect(c['riftlord']).toMatchObject({ armorType: 'boss', speed: 80, leakCost: 20, original: { hpMult: 24, xp: 60 } });
    for (const spec of Object.values(c)) expect(spec.armor).toBe(0);
  });

  it('has six Talent trees of three two-way rows and a capstone, costing 8 Stars each', () => {
    expect(Object.keys(TALENTS)).toHaveLength(42);
    for (const family of FAMILIES) {
      const tree = talentTree(family);
      expect(tree.map((t) => t.row)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    }
    expect(ROW_COST.reduce((a, b) => a + b, 0)).toBe(8);
    expect(original.treeRows('poison').map((r) => r.map((t) => t.id))).toEqual([
      ['potency', 'lingering'], ['contagion', 'corrode'], ['antivenom', 'thick-venom'], ['plague-wind'],
    ]);
  });

  it('has two Perks per family and the Tower Level XP table', () => {
    for (const family of FAMILIES) expect(PERKS[family]).toHaveLength(2);
    expect(LEVEL_XP).toEqual([0, 8, 20, 36, 56, 80, 108, 140, 176, 216]);
  });

  it('builds Stage 1 as a valid 32 × 18 Map of Open ground beside one S-bend road, with the mill and its pond', () => {
    expect(CAMPAIGN_LENGTH).toBe(12);
    expect(STAGES[0]).toBe(MILL_ROAD);
    const map = MILL_ROAD.map;
    expect(validateMap(map)).toBeNull();
    expect([map.cols, map.rows]).toEqual([32, 18]);
    expect(map.routes).toHaveLength(1);
    expect(routeData(map)!.length).toBe(5376);
    expect(map.routes![0]!.air!.length).toBeGreaterThanOrEqual(2);
    expect(map.scenery!.map((p) => [p.kind, p.name, p.at, p.rects])).toEqual([
      ['building', 'the mill', 'on the mill', [[13, 4, 4, 4]]],
      ['water', 'the millpond', 'in the millpond', [[17, 10, 4, 4]]],
    ]);
    // Everything but the road and those 32 cells is Open ground: 576 − 168 − 32.
    const cells = map.terrain.join('');
    expect([...cells].filter((c) => c === ',').length).toBe(168);
    expect([...cells].filter((c) => c === '#').length).toBe(32);
    expect([...cells].filter((c) => c === '.').length).toBe(376);
    expect(MILL_ROAD).toMatchObject({ number: 1, threat: 1, gold: 250, region: 'ashfield' });
    expect(MILL_ROAD.waves).toHaveLength(12);
  });

  it('starts Stage 1 with Ghouls and brings Hounds in at Wave 5, alone first', () => {
    const creeps = MILL_ROAD.waves.map((w) => [...new Set(w.groups.map((g) => g.creep))]);
    for (let i = 0; i < 4; i++) expect(creeps[i]).toEqual(['ghoul']);
    expect(creeps[4]).toEqual(['hound']);
    expect(creeps[5]).toEqual(expect.arrayContaining(['ghoul', 'hound']));
    // HP at each Wave's Threat: a light start that rises, the Hounds' first Wave lighter than the mix after it, the last Wave the hardest.
    const hp = MILL_ROAD.waves.map((w, i) => w.groups.reduce((s, g) => s + g.count * ORIGINAL_CREEPS[g.creep]!.original.hpMult, 0) * 1.1 ** i);
    expect(MILL_ROAD.waves[0]!.groups).toEqual([{ creep: 'ghoul', count: 7, gap: 1.45 }]);
    for (let i = 1; i < 4; i++) expect(hp[i]).toBeGreaterThan(hp[i - 1]!);
    expect(hp[4]).toBeLessThan(hp[5]!);
    expect(Math.max(...hp)).toBe(hp[11]);
  });
});

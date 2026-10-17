import { describe, expect, it } from 'vitest';
import {
  ARMOR_TYPES, BASE_SLATES, BOSS, BOSS_DELAY, COMBO_SLATES, GEM_CHECKPOINTS, GEM_CREEPS, GEM_DAMAGE_TABLE, GEM_MAP,
  GEM_TYPES, GEM_WAVES, QUALITIES, QUALITY_COST, QUALITY_WEIGHTS, SPAWN_INTERVAL, SPECIAL_LINES, STONE_OF_BRYVX,
  gemId, waveCreepId,
} from '../../../src/content/gem';
import { effectHandler, gem, getMode, routeCells, validateMap } from '../../../src/sim';
import { newGemRun } from './helpers';

const towers = gem.GEM_TOWERS;

describe('Gem content', () => {
  it('registers as a Game Mode whose tables pass the core checks', () => {
    // registerMode throws on any bad tower, aura, effect, creep or Wave.
    expect(getMode('gem').id).toBe('gem');
    expect(getMode('gem').towers).toBe(towers);
  });

  it('has 8 types × 6 qualities of gem, each 2 × 2 with an attack', () => {
    for (const type of GEM_TYPES) {
      for (const q of QUALITIES) {
        const spec = towers[gemId(type, q)];
        expect(spec, gemId(type, q)).toBeDefined();
        expect(spec!.footprint).toBe(2);
        expect(spec!.attack).toBeDefined();
        expect(spec!.gem).toMatchObject({ kind: 'gem', type, quality: q });
      }
    }
    expect(Object.values(towers).filter((t) => t.gem.kind === 'gem')).toHaveLength(48);
    expect(towers['amethyst-chipped']!.attack).toMatchObject({ damage: [10, 15], cooldown: 0.8, range: 1000, targets: 'air', attackType: 'pierce' });
    expect(towers['topaz-perfect']!.gem.barrage).toEqual({ damage: 75, targets: 7, radius: 600, cooldown: 1 });
    expect(towers['ruby-great']!.gem.barrage).toEqual({ damage: 140, targets: 1, radius: 900, cooldown: 0.5 });
  });

  it('gives every effect, aura and status a registered kind whose numbers validate', () => {
    for (const [id, t] of Object.entries(towers)) {
      const effects = [...(t.attack?.effects ?? []), ...(t.gem.barrage?.onHit ?? [])];
      for (const e of effects) {
        const h = effectHandler(e.kind);
        expect(h, `${id}: ${e.kind}`).toBeDefined();
        expect(h!.validate?.(e) ?? null, `${id}: ${e.kind}`).toBeNull();
      }
      for (const a of t.auras ?? []) expect(effectHandler(a.kind), `${id}: aura ${a.kind}`).toBeDefined();
    }
    for (const kind of ['gem.stun', 'gem.stunGuard', 'gem.vulnerable', 'gem.incinerated']) expect(effectHandler(kind)).toBeDefined();
  });

  it('lists the 13 Recipes with their tiers and upgrade costs', () => {
    expect(SPECIAL_LINES).toHaveLength(13);
    const parts = SPECIAL_LINES.flatMap((l) => l.parts);
    expect(new Set(parts).size).toBe(parts.length);
    for (const line of SPECIAL_LINES) {
      for (const p of line.parts) expect(towers[p]?.gem.kind, p).toBe('gem');
      line.tiers.forEach((id, i) => {
        expect(towers[id]?.gem).toMatchObject({ kind: 'special', family: line.id, tier: i + 1 });
        expect(towers[id]!.gem.next).toBe(line.tiers[i + 1]);
      });
    }
    const costs = Object.fromEntries(
      SPECIAL_LINES.flatMap((l) => l.tiers.slice(1)).map((id) => [towers[id]!.name, towers[id]!.cost]),
    );
    expect(costs).toEqual({
      'Vivid Malachite': 25, 'Mighty Malachite': 180, 'Sterling Silver': 25, 'Silver Knight': 190, 'Blood Star': 30,
      'Fire Star': 190, 'China Jade': 45, 'Lucky China Jade': 250, 'Red Facet': 100, 'Rose Quartz Crystal': 150,
      'Enchanted Emerald': 185, 'Egyptian Gold': 205, 'Uranium 235': 190, 'Great Pink Diamond': 175,
      'Paraiba Tourmaline Facet': 275, 'Mystic Black Opal': 275, 'Ancient Blood Stone': 225, 'Star Yellow Sapphire': 180,
    });
    expect(towers[STONE_OF_BRYVX]?.gem.kind).toBe('stone');
    // Two specials roll several dice.
    expect(towers['enchanted-emerald']!.attack!.dice).toEqual([2, 51]);
    expect(towers['paraiba-tourmaline']!.attack!.dice).toEqual([5, 79]);
  });

  it('lists 8 base slates and 4 combination slates, all walkable 2 × 2', () => {
    expect(BASE_SLATES).toHaveLength(8);
    for (const s of BASE_SLATES) {
      expect(towers[s.normal]?.gem.quality).toBe('normal');
      for (const f of s.flawed) expect(towers[f]?.gem.quality).toBe('flawed');
      const partner = BASE_SLATES.find((p) => p.id === s.partner)!;
      expect(partner.partner).toBe(s.id);
      expect(partner.combo).toBe(s.combo);
      expect(COMBO_SLATES[s.combo]).toContain(s.id);
    }
    const slates = Object.values(towers).filter((t) => t.gem.kind === 'slate');
    expect(slates).toHaveLength(12);
    for (const t of slates) expect(t).toMatchObject({ walkable: true, footprint: 2 });
  });

  it('has Gem Quality 0–8, whose weights total 100 per type and 800 over all gems', () => {
    expect(QUALITY_WEIGHTS).toHaveLength(9);
    for (const w of QUALITY_WEIGHTS) {
      expect(w.reduce((a, b) => a + b, 0)).toBe(100);
      expect(w[5]).toBe(0);
      expect(w.reduce((a, b) => a + b, 0) * GEM_TYPES.length).toBe(800);
    }
    expect(QUALITY_COST).toEqual([20, 50, 80, 110, 140, 170, 200, 230]);
    expect(QUALITY_COST.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(gem.qualityOdds(8)).toEqual([0, 0.3, 0.3, 0.3, 0.1, 0]);
  });

  it('has 50 Waves of 10 creeps 1.61 s apart, air every 4th, and the Damage Test with Wave 50', () => {
    expect(GEM_WAVES).toHaveLength(50);
    GEM_WAVES.forEach((w, i) => {
      const n = i + 1;
      expect(w.groups[0]).toEqual({ creep: waveCreepId(n), count: 10, interval: SPAWN_INTERVAL });
      expect(GEM_CREEPS[waveCreepId(n)]!.flying).toBe(n % 4 === 0);
    });
    expect(GEM_WAVES[49]!.groups[1]).toEqual({ creep: BOSS, count: 1, interval: 0, delay: BOSS_DELAY });
    expect(GEM_CREEPS[waveCreepId(1)]).toMatchObject({ hp: 10, armor: 12, armorType: 'normal', speed: 265, bounty: 1 });
    expect(GEM_CREEPS[waveCreepId(50)]).toMatchObject({ hp: 85_000, armor: 35, armorType: 'divine', bounty: 20 });
    expect(GEM_CREEPS[BOSS]).toMatchObject({ hp: 500_000, armor: 40, armorType: 'divine', bounty: 1000, hero: true });
    for (const [id, c] of Object.entries(GEM_CREEPS)) {
      expect(ARMOR_TYPES, id).toContain(c.armorType);
      expect(c.minSpeed, id).toBeGreaterThanOrEqual(220);
      expect(c.minSpeed, id).toBeLessThanOrEqual(c.speed);
    }
    // Our own names, not the Classic's.
    expect(new Set(Object.values(GEM_CREEPS).map((c) => c.name)).size).toBe(51);
  });

  it('uses Gem TD+\'s attack × armor table', () => {
    expect(Object.keys(GEM_DAMAGE_TABLE).sort()).toEqual(['chaos', 'hero', 'magic', 'normal', 'pierce', 'siege', 'spells']);
    for (const row of Object.values(GEM_DAMAGE_TABLE)) expect(Object.keys(row).sort()).toEqual([...ARMOR_TYPES].sort());
    expect(GEM_DAMAGE_TABLE['spells']!['hero']).toBe(1.75);
    expect(GEM_DAMAGE_TABLE['normal']!['none']).toBe(0.2);
  });

  it('has the 95 × 71 field with 4,955 buildable cells and a route through checkpoints 1–7 to the exit', () => {
    expect(validateMap(GEM_MAP)).toBeNull();
    expect([GEM_MAP.cols, GEM_MAP.rows]).toEqual([95, 71]);
    expect(GEM_MAP.terrain.join('').split('').filter((ch) => ch === '.')).toHaveLength(4955);
    expect(GEM_MAP.waypoints).toHaveLength(GEM_CHECKPOINTS.length + 1);
    const s = newGemRun();
    const route = routeCells(s);
    const last = route[route.length - 1]!;
    const exit = GEM_MAP.waypoints[7]!.map(([c, r]) => r * GEM_MAP.cols + c);
    expect(exit).toContain(last);
    expect(route.length).toBeGreaterThan(190);
  });
});

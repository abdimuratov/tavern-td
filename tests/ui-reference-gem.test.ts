import { describe, expect, it } from 'vitest';
import {
  ARMOR_TYPES, BASE_SLATES, BOSS, COMBO_SLATES, EXTRA_CHANCE, FATAL_LEAK_WAVE, GEM_CREEPS, GEM_DAMAGE_TABLE, GEM_GEMS, GEM_SPECIALS,
  GEM_TYPES, GEM_WAVES, MAX_QUALITY, QUALITIES, QUALITY_COST, SPECIAL_LINES, STONE_OF_BRYVX, WAVE_COUNT, gemId, typeName, waveCreepId,
  type GemType,
} from '../src/content/gem';
import { gem, step, waveGroupNumbers, type Difficulty, type GameState } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { GEM_UI } from '../src/ui/modes/gem';
import { bestAgainst } from '../src/ui/modes/gem/reference';
import type { ReferenceRank, ReferenceRow, ReferenceSection, ReferenceValues } from '../src/ui/reference/types';
import { finishWave, newGemRun, placeFive, send, spotsFor, type GemRun } from './sim/gem/helpers';

// Gem's Waves & Towers sheet: Best against from Gem's damage table, the 50
// Waves and the Damage Test with the numbers a real Run spawns, every gem,
// Recipe, slate and Gem Quality level as the content has them, and Now and
// Next in a Run.

const REF = GEM_UI.reference!;

function viewOf(state: GameState): RunView {
  return { state, side: 0, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

const order = (r: ReferenceRank): string[] => r.items.map((i) => i.text);
const rankOf = (r: ReferenceRank, text: string): number => r.items.find((i) => i.text === text)!.rank;
const fact = (s: ReferenceSection, key: string): string | undefined => s.facts?.find(([k]) => k === key)?.[1];
const plain = (s: string): number => Number(s.replace(/[^\d.]/g, ''));
const pctOf = (share: number): string => `${Math.round(share * 1000) / 10}%`;
const attackOf = (type: GemType): string => GEM_GEMS[gemId(type, 'chipped')]!.attack!.attackType;
const typeByName = new Map(GEM_TYPES.map((t) => [typeName(t), t]));

function waveRows(values: ReferenceValues = {}): readonly ReferenceRow[] {
  return REF.waves(values).groups[0]!.rows;
}

function towerRow(id: string): ReferenceRow {
  for (const g of REF.towers({}).groups) {
    if (g.head?.id === id) return g.head;
    const row = g.rows.find((r) => r.id === id);
    if (row) return row;
  }
  throw new Error(`no row ${id}`);
}

/** Starts Wave `n` of a real Run: the Run jumps to just before it, places a Draft and keeps a gem. */
function startWave(difficulty: Difficulty, n: number): GemRun {
  const s = newGemRun(1, difficulty);
  s.wave.number = n - 1;
  placeFive(s, spotsFor(0));
  send(s, { type: 'gem.keep', tower: s.mode.draft[0]! });
  // Leaks must not end the Run while it spawns.
  s.lives = 99;
  return s;
}

/** The first creep of `spec` a real Run spawns on Wave `n`. */
function spawned(difficulty: Difficulty, n: number, spec = waveCreepId(n)): { maxHp: number; bounty: number; speed: number } {
  const s = startWave(difficulty, n);
  for (let i = 0; i < 30 * 20; i++) {
    const c = s.creeps.find((x) => x.spec === spec);
    if (c) return { maxHp: c.maxHp, bounty: c.bounty, speed: c.speed * 30 };
    step(s, []);
  }
  throw new Error(`Wave ${n} spawned no ${spec}`);
}

describe('Best against', () => {
  it('reads every gem type\'s share from Gem\'s damage table, by its attack type against the creep\'s armor', () => {
    for (const [id, creep] of Object.entries(GEM_CREEPS)) {
      const b = bestAgainst(creep);
      for (const item of b.types.items) {
        const type = typeByName.get(item.text)!;
        expect(item.value, `${id} ${item.text}`).toBe(pctOf(GEM_DAMAGE_TABLE[attackOf(type)]![creep.armorType]!));
      }
      // The table's favourite among the gems that reach it comes first.
      const reach = GEM_TYPES.filter((t) => {
        const targets = GEM_GEMS[gemId(t, 'chipped')]!.attack!.targets;
        return creep.flying ? targets !== 'ground' : targets !== 'air';
      });
      const best = Math.max(...reach.map((t) => GEM_DAMAGE_TABLE[attackOf(t)]![creep.armorType]!));
      expect(GEM_DAMAGE_TABLE[attackOf(typeByName.get(order(b.types)[0]!)!)]![creep.armorType], id).toBe(best);
    }
  });

  it('puts each armor\'s favourite first: Sapphire on Hero armor, Amethyst on air, Diamond on Large, Emerald on Fortified', () => {
    const first = (n: number): string => order(bestAgainst(GEM_CREEPS[waveCreepId(n)]!).types)[0]!;
    expect(GEM_CREEPS[waveCreepId(10)]!.armorType).toBe('hero');
    expect(first(10)).toBe('Sapphire');
    expect(first(4)).toBe('Amethyst');
    expect(first(3)).toBe('Diamond');
    expect(first(5)).toBe('Emerald');
  });

  it('drops what can\'t reach the creep\'s layer: ground-only Diamond and Pink Diamond for a flyer, air-only Amethyst and Red Crystal on the ground', () => {
    const flyer = bestAgainst(GEM_CREEPS[waveCreepId(4)]!);
    expect(GEM_CREEPS[waveCreepId(4)]!.flying).toBe(true);
    expect(order(flyer.types)).not.toContain('Diamond');
    expect(flyer.types.note).toBe('Can\'t hit air: Diamond');
    expect(order(flyer.specials)).not.toContain('Pink Diamond');
    expect(flyer.specials.note).toBe('Can\'t hit air: Pink Diamond');
    expect(order(flyer.types)).toHaveLength(GEM_TYPES.length - 1);
    const ground = bestAgainst(GEM_CREEPS[waveCreepId(1)]!);
    expect(order(ground.types)).not.toContain('Amethyst');
    expect(ground.types.note).toBe('Can\'t hit ground: Amethyst');
    // Red Crystal's first Tier shoots only flyers; Rose Quartz Crystal's burn reaches the ground.
    expect(ground.specials.note).toBe('Can\'t hit ground: Red Crystal (Rose Quartz Crystal can)');
    expect(order(ground.specials)).toHaveLength(SPECIAL_LINES.length - 1);
  });

  it('breaks the table\'s ties with spell damage, which skips armor: Emerald\'s poison and the burns on the Damage Test', () => {
    const boss = GEM_CREEPS[BOSS]!;
    const b = bestAgainst(boss);
    expect(b.types.items.every((i) => i.value === pctOf(GEM_DAMAGE_TABLE['siege']![boss.armorType]!))).toBe(true);
    expect(order(b.types)[0]).toBe('Emerald');
    expect(rankOf(b.types, 'Emerald')).toBe(1);
    expect(rankOf(b.types, 'Topaz')).toBe(2);
    expect(b.types.items[0]!.why).toEqual([`its poison skips its ${boss.armor} armor`]);
    expect(rankOf(b.specials, 'Star Ruby')).toBe(1);
    expect(rankOf(b.specials, 'Uranium 238')).toBe(1);
    expect(b.specials.items.find((i) => i.text === 'Star Ruby')!.why).toEqual([`its burn skips its ${boss.armor} armor`]);
    expect(rankOf(b.specials, 'Malachite')).toBeGreaterThan(1);
  });
});

describe('the Waves tab', () => {
  it('lists the 50 Waves and then the Damage Test, with their creeps, Air and armor marks', () => {
    const rows = waveRows();
    expect(rows.map((r) => r.id)).toEqual([...GEM_WAVES.map((_, i) => `wave-${i + 1}`), 'damage-test']);
    expect(rows).toHaveLength(WAVE_COUNT + 1);
    rows.slice(0, WAVE_COUNT).forEach((row, i) => {
      const n = i + 1;
      const g = GEM_WAVES[i]!.groups[0]!;
      const creep = GEM_CREEPS[g.creep]!;
      expect(row.title).toContain(`${g.count} ${creep.name}`);
      const tags = (row.tags ?? []).map((t) => t.text);
      expect(tags.includes('Air'), `Wave ${n}`).toBe(creep.flying);
      expect(tags).toContain({ small: 'Small', medium: 'Medium', large: 'Large', fort: 'Fortified', normal: 'Normal', hero: 'Hero', divine: 'Divine', none: 'Unarmored' }[creep.armorType]);
      const [head, section] = row.sections;
      expect(fact(head!, 'Wave bonus')).toBe(`${gem.waveEndGold(n)} gold`);
      expect(fact(section!, 'Armor')).toMatch(new RegExp(` ${creep.armor}$`));
      expect(fact(section!, 'Leak'), `Wave ${n}`).toBe(n >= FATAL_LEAK_WAVE ? 'Ends the Run' : 'Free, but no bounty');
    });
    expect(rows[0]!.sections[0]!.facts![2]).toEqual(['Wave bonus', '7 gold']);
    expect(rows[WAVE_COUNT - 1]!.title).toContain('+ Damage Test');
    expect(ARMOR_TYPES).toContain(GEM_CREEPS[BOSS]!.armorType);
  });

  it('shows HP, bounty and speed as a real Run spawns them, at Easy, Normal and Hard', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const rows = waveRows({ difficulty: d });
      for (const n of [1, 4, 10, 27, 49]) {
        const real = spawned(d, n);
        const section = rows[n - 1]!.sections[1]!;
        expect(plain(fact(section, 'HP')!), `${d} Wave ${n}`).toBe(real.maxHp);
        expect(plain(fact(section, 'Bounty')!), `${d} Wave ${n}`).toBe(real.bounty);
        expect(plain(fact(section, 'Speed')!), `${d} Wave ${n}`).toBeCloseTo(real.speed, 6);
        expect(plain(rows[n - 1]!.summary!)).toBe(real.maxHp);
      }
    }
    // Hard raises Wave 1's 10 HP by 30%, Easy cuts it by 25%.
    expect(waveRows({ difficulty: 'hard' })[0]!.summary).toBe('13 HP');
    expect(waveRows({ difficulty: 'easy' })[0]!.summary).toBe('8 HP');
  });

  it('gives every Wave the sim\'s own numbers, and the Damage Test those it spawns with', () => {
    for (const d of ['easy', 'hard', 'insane'] as const) {
      const rows = waveRows({ difficulty: d });
      GEM_WAVES.forEach((w, i) => {
        const nums = waveGroupNumbers(gem.GEM_RULES, w, w.groups[0]!, d);
        expect(plain(fact(rows[i]!.sections[1]!, 'HP')!), `${d} Wave ${i + 1}`).toBe(nums.hp);
        expect(fact(rows[i]!.sections[0]!, 'Bounty pool')).toBe(`${nums.bounty * w.groups[0]!.count} gold`);
      });
      const last = GEM_WAVES[WAVE_COUNT - 1]!;
      const boss = waveGroupNumbers(gem.GEM_RULES, last, last.groups.find((g) => g.creep === BOSS)!, d);
      const test = rows.at(-1)!;
      expect(plain(fact(test.sections[0]!, 'HP')!)).toBe(boss.hp);
      expect(fact(test.sections[0]!, 'Bounty')).toBe(`${boss.bounty.toLocaleString('en-US')} gold each`);
    }
    // The Damage Test as a real Run spawns it, 16.1 s into Wave 50.
    const real = spawned('hard', WAVE_COUNT, BOSS);
    expect(plain(fact(waveRows({ difficulty: 'hard' }).at(-1)!.sections[0]!, 'HP')!)).toBe(real.maxHp);
    expect(fact(waveRows().at(-1)!.sections[0]!, 'Leak')).toBe('Ends the Run');
  });
});

describe('the Towers tab', () => {
  it('has the 8 gem types at every quality, with the content\'s damage, range and what merging makes', () => {
    const groups = REF.towers({}).groups;
    expect(groups.filter((g) => g.id.startsWith('gem-')).map((g) => g.id)).toEqual(GEM_TYPES.map((t) => `gem-${t}`));
    for (const type of GEM_TYPES) {
      const g = groups.find((x) => x.id === `gem-${type}`)!;
      expect(g.rows.map((r) => r.id)).toEqual(QUALITIES.map((q) => `tower-${gemId(type, q)}`));
      for (const q of QUALITIES) {
        const spec = GEM_GEMS[gemId(type, q)]!;
        const s = towerRow(`tower-${gemId(type, q)}`).sections[0]!;
        const [lo, hi] = spec.attack!.damage;
        expect(fact(s, 'Damage')).toBe(lo === hi ? lo.toLocaleString('en-US') : `${lo.toLocaleString('en-US')}–${hi.toLocaleString('en-US')}`);
        expect(fact(s, 'Range')).toBe(spec.attack!.range.toLocaleString('en-US'));
      }
    }
    const flawed = towerRow('tower-amethyst-flawed').sections[0]!;
    expect(fact(flawed, '×2')).toBe('Normal Amethyst');
    expect(fact(flawed, '×3 or ×4')).toBe('Flawless Amethyst');
    expect(fact(flawed, 'Downgrade')).toBe('Chipped Amethyst');
    expect(fact(flawed, 'Recipe')).toBe('Red Crystal');
    expect(fact(towerRow('tower-ruby-perfect').sections[0]!, '×3 or ×4')).toBe('Stone of Bryvx');
    // Great never rolls, so no Draft merges or downgrades it.
    const great = towerRow('tower-ruby-great').sections[0]!;
    expect(fact(great, 'Rolls')).toBe('Never; only merging makes it');
    expect(fact(great, '×2')).toBeUndefined();
    expect(fact(towerRow('tower-topaz-perfect').sections[0]!, 'Rolls')).toBe(`From Gem Quality ${MAX_QUALITY}`);
    expect(fact(towerRow('tower-topaz-normal').sections[0]!, 'Slate')).toBe('Hold Slate, with Flawed Amethyst or Flawed Sapphire');
  });

  it('says what each gem type is strong and weak against, and the layer it can\'t hit', () => {
    const amethyst = towerRow('gem-amethyst');
    const strong = amethyst.sections.find((s) => s.title === 'Strong against')!;
    expect(strong.tags!.map((t) => t.text)).toEqual([`Unarmored ${pctOf(GEM_DAMAGE_TABLE['pierce']!['none']!)}`]);
    const weak = amethyst.sections.find((s) => s.title === 'Weak against')!;
    expect(weak.tags!.map((t) => t.text)).toEqual(['Ground']);
    const diamond = towerRow('gem-diamond');
    expect(diamond.sections.find((s) => s.title === 'Strong against')!.tags![0]!.text).toBe(`Large ${pctOf(GEM_DAMAGE_TABLE['normal']!['large']!)}`);
    expect(diamond.sections.find((s) => s.title === 'Weak against')!.tags!.map((t) => t.text)).toContain('Air');
    expect(diamond.tags!.map((t) => t.text)).toEqual(['Ground only']);
  });

  it('has every Recipe with its exact gems, and each Tier with its gold and running total', () => {
    for (const line of SPECIAL_LINES) {
      const head = towerRow(`recipe-${line.id}`);
      expect(fact(head.sections[0]!, 'Gems')).toBe(line.parts.map((p) => GEM_GEMS[p]!.name).join(' + '));
      let total = 0;
      line.tiers.forEach((id, i) => {
        const s = towerRow(`tower-${id}`).sections[0]!;
        if (i === 0) {
          expect(fact(s, 'From')).toBe('the Recipe');
          return;
        }
        total += GEM_SPECIALS[id]!.cost!;
        expect(fact(s, 'Upgrade'), id).toBe(`${GEM_SPECIALS[id]!.cost!.toLocaleString('en-US')} gold`);
        expect(fact(s, 'Total'), id).toBe(`${total.toLocaleString('en-US')} gold`);
      });
    }
    expect(fact(towerRow('recipe-malachite').sections[0]!, 'Gems')).toBe('Chipped Aquamarine + Chipped Emerald + Chipped Opal');
    expect(fact(towerRow('recipe-paraiba').sections[0]!, 'Gems')).toBe('Perfect Aquamarine + Flawless Opal + Flawed Aquamarine + Flawed Emerald');
    // Kill Step lines read the per-step tables.
    expect(towerRow('tower-blood-stone').sections[0]!.lines).toContain('Kill Step 1 → 11: lightning 180 → 480 a creep');
    expect(fact(towerRow(`tower-${STONE_OF_BRYVX}`).sections[0]!, 'From')).toBe('×3 or ×4 identical Perfect gems in one Draft');
  });

  it('has every slate with what makes it, and Gem Quality\'s odds and prices with Extra Chance', () => {
    const slates = REF.towers({}).groups.find((g) => g.id === 'slates')!;
    expect(slates.rows.map((r) => r.id)).toEqual([...BASE_SLATES.map((x) => `tower-${x.id}`), ...Object.keys(COMBO_SLATES).map((id) => `tower-${id}`)]);
    expect(fact(towerRow('tower-hold-slate').sections[0]!, 'From')).toBe('Normal Topaz + Flawed Amethyst or Flawed Sapphire');
    expect(fact(towerRow('tower-hold-slate').sections[0]!, 'Pair')).toBe('with Air Slate, makes Ancient Slate');
    expect(fact(towerRow('tower-ancient-slate').sections[0]!, 'From')).toBe('Hold Slate + Air Slate');
    const quality = REF.towers({}).groups.find((g) => g.id === 'quality')!;
    expect(quality.rows.map((r) => r.id)).toEqual([...Array.from({ length: MAX_QUALITY + 1 }, (_, l) => `quality-${l}`), 'extra-chance']);
    for (let level = 0; level <= MAX_QUALITY; level++) {
      const s = quality.rows[level]!.sections[0]!;
      const odds = gem.qualityOdds(level);
      QUALITIES.forEach((q, i) => {
        const name = q.charAt(0).toUpperCase() + q.slice(1);
        expect(fact(s, name), `${level} ${q}`).toBe(odds[i]! > 0 ? pctOf(odds[i]!) : undefined);
      });
      if (level > 0) expect(fact(s, 'Research')).toBe(`${QUALITY_COST[level - 1]} gold`);
    }
    expect(fact(quality.head!.sections[0]!, 'All of them')).toBe(`${QUALITY_COST.reduce((a, b) => a + b, 0).toLocaleString('en-US')} gold`);
    const extra = quality.rows.at(-1)!.sections[0]!;
    expect(fact(extra, 'A gem type')).toBe(`${EXTRA_CHANCE.typeCost} gold a round`);
    expect(fact(extra, 'A base slate')).toBe(`${EXTRA_CHANCE.slateCost} gold a round`);
  });
});

describe('in a Run', () => {
  it('opens on the Run\'s Difficulty, locked', () => {
    const s = newGemRun(1, 'hard');
    const ctx = { view: viewOf(s) };
    const values = REF.defaults(ctx);
    expect(values['difficulty']).toBe('hard');
    const f = REF.filters(values, ctx).find((x) => x.id === 'difficulty')!;
    expect(f.locked).toBe('Fixed for this Run');
    expect(f.value).toBe('hard');
    expect(REF.filters(REF.defaults({}), {}).find((x) => x.id === 'difficulty')!.locked).toBeUndefined();
  });

  it('marks the Wave being fought, or the one the Draft leads to, and the next', () => {
    const s = newGemRun(1, 'normal');
    const current = (): ReturnType<NonNullable<typeof REF.current>> => REF.current!(viewOf(s), REF.defaults({ view: viewOf(s) }));
    expect(current()).toEqual({ now: 'wave-1', next: 'wave-2' });
    placeFive(s, spotsFor(0));
    send(s, { type: 'gem.keep', tower: s.mode.draft[0]! });
    expect(gem.gemStatus(s).step).toBe('wave');
    expect(current()).toEqual({ now: 'wave-1', next: 'wave-2' });
    s.lives = 99;
    finishWave(s);
    s.lives = 1;
    expect(gem.gemStatus(s).step).toBe('draft');
    expect(current()).toEqual({ now: 'wave-2', next: 'wave-3' });
    const last = startWave('normal', WAVE_COUNT);
    expect(REF.current!(viewOf(last), {})).toEqual({ now: `wave-${WAVE_COUNT}`, next: 'damage-test' });
    s.phase = 'lost';
    expect(current()).toEqual({ now: null, next: null });
  });
});

import { describe, expect, it } from 'vitest';
import {
  DAMAGE_TABLE, DIFFICULTY_HP, ELEMENTAL_HP, ELEMENTS, ELEMENT_CREEPS, ELEMENT_EXPRESS_WAVES, ELEMENT_FULL_WAVES, ELEMENT_TOWERS,
  EXPRESS_WAVES, FULL_WAVES, LUMBER_AFTER, SELL, TOWER_IDS, elementName,
  type DamageElement,
} from '../src/content/element';
import { element, step, type Difficulty, type GameState } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { ELEMENT_UI } from '../src/ui/modes/element';
import { elementRank, holdable, lumberBy, neededLevels, towerRank } from '../src/ui/modes/element/reference';
import type { ReferenceRank, ReferenceRow, ReferenceSection, ReferenceValues } from '../src/ui/reference/types';
import { newElementRun, send, type ElementRun } from './sim/element/helpers';

// Element's Waves & Towers sheet: Best against from the six-Element cycle and
// the towers a Run can hold by each Wave, Full's 55 Waves and boss Waves and
// Express's 30 with the numbers a real Run spawns, the Elementals, all 144
// towers with their Element requirements, and Now and Next in a Run.

const REF = ELEMENT_UI.reference!;

function viewOf(state: GameState): RunView {
  return { state, side: 0, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

const order = (r: ReferenceRank): string[] => r.items.map((i) => i.text);
const rankOf = (r: ReferenceRank, text: string): number => r.items.find((i) => i.text === text)!.rank;
const valueOf = (r: ReferenceRank, text: string): string | undefined => r.items.find((i) => i.text === text)?.value;
const fact = (s: ReferenceSection, key: string): string | undefined => s.facts?.find(([k]) => k === key)?.[1];
const plain = (s: string): number => Number(s.replace(/[^\d.]/g, ''));
const pctOf = (share: number): string => `${Math.round(share * 1000) / 10}%`;
const nameOf = (d: DamageElement): string => (d === 'composite' ? 'Composite' : elementName(d));
const name = (id: string): string => ELEMENT_TOWERS[id]!.name;

function waveRows(values: ReferenceValues): readonly ReferenceRow[] {
  return REF.waves(values).groups.find((g) => g.id === 'waves')!.rows;
}

function towerRow(id: string): ReferenceRow {
  for (const g of REF.towers({}).groups) {
    if (g.head?.id === id) return g.head;
    const row = g.rows.find((r) => r.id === id);
    if (row) return row;
  }
  throw new Error(`no row ${id}`);
}

/** The first creep a real Run spawns on Wave `n`: the Run jumps to the Break before it and sends it. */
function spawned(length: 'full' | 'express', difficulty: Difficulty, n: number): { maxHp: number; bounty: number; speed: number; count: number } {
  const s = newElementRun({ length, difficulty });
  s.wave.number = n - 1;
  send(s, { type: 'element.sendNow' });
  for (let i = 0; i < 30 * 40; i++) {
    const wave = s.wave.active.find((w) => w.number === n);
    const c = s.creeps.find((x) => x.wave === n);
    if (c && wave) return { maxHp: c.maxHp, bounty: c.bounty, speed: c.speed * 30, count: wave.groups.reduce((sum, g) => sum + g.count, 0) };
    step(s, []);
  }
  throw new Error(`Wave ${n} spawned nothing`);
}

describe('Best against', () => {
  it('reads every share from the cycle: Water → Fire 200%, Fire → Water 50%, 90% into Composite, Composite 100% to all', () => {
    for (const armor of [...ELEMENTS, 'composite'] as const) {
      const r = elementRank(armor);
      for (const d of [...ELEMENTS, 'composite'] as const) {
        expect(valueOf(r, nameOf(d)), `${d} → ${armor}`).toBe(pctOf(DAMAGE_TABLE[d][armor] ?? 1));
      }
      expect(valueOf(r, 'Composite')).toBe('100%');
    }
    expect(valueOf(elementRank('fire'), 'Water')).toBe('200%');
    expect(valueOf(elementRank('water'), 'Fire')).toBe('50%');
    expect(order(elementRank('fire'))[0]).toBe('Water');
    expect(order(elementRank('water')).at(-1)).toBe('Fire');
    const composite = elementRank('composite');
    expect(ELEMENTS.every((e) => valueOf(composite, elementName(e)) === '90%')).toBe(true);
    expect(order(composite)[0]).toBe('Composite');
    expect(rankOf(composite, 'Water')).toBe(2);
  });

  it('ranks the towers a Run can hold by the Wave: the Element that beats it, with splash first on 30 creeps', () => {
    // Wave 3 of Full is Fire; one Lumber by then holds Water 1 at most.
    expect(ELEMENT_FULL_WAVES[2]!.element).toBe('fire');
    const r = towerRank('fire', null, 30, 'full', 3);
    expect(order(r).sort()).toEqual([name('water_tower'), name('water_arrow_tower'), name('water_cannon_tower')].sort());
    expect(r.items.every((i) => i.value === '200%')).toBe(true);
    // Splashing Tidecaller and Water Cannon before the Water Arrow.
    expect(rankOf(r, name('water_arrow_tower'))).toBeGreaterThan(rankOf(r, name('water_cannon_tower')));
    expect(r.items.find((i) => i.text === name('water_cannon_tower'))!.why).toEqual(['hits several of its 30 at once']);
    expect(r.note).toMatch(/^Not by Wave 3: /);
    expect(r.note).toContain(name('vapor_tower'));
    // By Wave 41 there are 9 Lumber: the level-3 lines and a Pure tower.
    const late = order(towerRank('fire', 'mechanical', 30, 'full', 41));
    expect(late).toContain(name('pure_water_tower'));
    expect(late).toContain(name('flooding_tower_3'));
    // A bulky Wave of 15 gives splash no edge.
    expect(towerRank('fire', 'bulky', 15, 'full', 41).items.every((i) => !i.why)).toBe(true);
  });

  it('follows the Traits on ties: slows up on fast creeps, down on mechanical ones', () => {
    const fast = towerRank('dark', 'fast', 30, 'full', 20);
    const nova = fast.items.find((i) => i.text === name('nova_tower'))!;
    expect(nova.why).toContain('its slows hold it back between dashes');
    expect(nova.rank).toBe(1);
    const mech = towerRank('earth', 'mechanical', 30, 'full', 15);
    const roots = mech.items.find((i) => i.text === name('roots_tower'))!;
    expect(roots.why).toContain('its shield purges slows and stuns');
    expect(roots.rank).toBeGreaterThan(rankOf(mech, name('enchantment_tower')));
    // Composite creeps take the most from Arrow and Cannon, and 90% from every Element.
    const comp = towerRank('composite', null, 30, 'full', 13);
    expect(order(comp).sort()).toEqual([name('basic_arrow_tower'), name('basic_cannon_tower')].sort());
    expect(comp.note).toContain('Every Element deals 90% to it');
  });

  it('counts what a Run holds: Lumber from the start and the Lumber Waves, Express\'s level gates, a Pure Essence\'s Lumber', () => {
    expect(lumberBy('full', 1)).toBe(1);
    expect(lumberBy('full', 6)).toBe(2);
    expect(lumberBy('full', 51)).toBe(1 + LUMBER_AFTER.full.length);
    expect(lumberBy('express', 1)).toBe(2);
    expect(holdable('water_tower', 'full', 1)).toBe(true);
    expect(holdable('focused_water_tower', 'full', 1)).toBe(false);
    expect(holdable('vapor_tower', 'full', 6)).toBe(true);
    // Express: level 2 opens once Wave 6 is cleared, whatever the Lumber.
    expect(lumberBy('express', 6)).toBeGreaterThanOrEqual(2);
    expect(holdable('focused_water_tower', 'express', 6)).toBe(false);
    expect(holdable('focused_water_tower', 'express', 7)).toBe(true);
    // A Pure tower needs its Element at 3 and a Pure Essence: 4 Lumber before any is free.
    expect(neededLevels('pure_dark_tower')).toEqual({ dark: 3 });
    expect(holdable('pure_dark_tower', 'full', 16)).toBe(true);
    expect(holdable('pure_dark_tower', 'full', 11)).toBe(false);
  });
});

describe('the Waves tab', () => {
  it('has Full\'s 55 Waves and a boss line, and Express\'s 30, with their creeps, Elements and Traits', () => {
    const full = waveRows({ length: 'full' });
    expect(full.map((r) => r.id)).toEqual([...ELEMENT_FULL_WAVES.map((w) => `wave-${w.wave}`), 'boss']);
    expect(full).toHaveLength(FULL_WAVES + 1);
    const express = waveRows({ length: 'express' });
    expect(express.map((r) => r.id)).toEqual(ELEMENT_EXPRESS_WAVES.map((w) => `wave-${w.wave}`));
    expect(express).toHaveLength(EXPRESS_WAVES);
    for (const [rows, table] of [[full, ELEMENT_FULL_WAVES], [express, ELEMENT_EXPRESS_WAVES]] as const) {
      table.forEach((w, i) => {
        const row = rows[i]!;
        expect(row.title).toBe(`${w.count} ${ELEMENT_CREEPS[w.creep]!.name}`);
        const tags = (row.tags ?? []).map((t) => t.text);
        expect(tags).toContain(nameOf(w.element));
        if (w.trait) expect(tags).toContain(w.trait === 'time_lapse' ? 'Time lapse' : w.trait.charAt(0).toUpperCase() + w.trait.slice(1));
      });
    }
    // Lumber and Pure Essence come with clearing their Waves.
    expect(full[4]!.tags!.map((t) => t.text)).toContain('Lumber');
    expect(full[49]!.tags!.map((t) => t.text)).toEqual(expect.arrayContaining(['Lumber', 'Pure Essence']));
    expect(express[2]!.tags!.map((t) => t.text)).toContain('Lumber');
    expect(express[23]!.tags!.map((t) => t.text)).toContain('Pure Essence');
    expect(full[0]!.tags!.map((t) => t.text)).not.toContain('Lumber');
  });

  it('shows HP, bounty, speed and count as a real Run spawns them, at Easy and Hard, Full and Express', () => {
    for (const d of ['easy', 'hard'] as const) {
      for (const length of ['full', 'express'] as const) {
        const rows = waveRows({ length, difficulty: d });
        for (const n of length === 'full' ? [1, 13, 28, 55] : [1, 14, 30]) {
          const real = spawned(length, d, n);
          const section = rows[n - 1]!.sections[1]!;
          expect(plain(fact(section, 'HP')!), `${length} ${d} Wave ${n}`).toBe(real.maxHp);
          expect(plain(fact(section, 'Bounty')!), `${length} ${d} Wave ${n}`).toBe(real.bounty);
          expect(plain(fact(section, 'Speed')!)).toBeCloseTo(real.speed, 6);
          expect(plain(rows[n - 1]!.title)).toBe(real.count);
        }
        const table = length === 'full' ? ELEMENT_FULL_WAVES : ELEMENT_EXPRESS_WAVES;
        table.forEach((w, i) => expect(plain(rows[i]!.summary!), `${length} ${d} Wave ${w.wave}`).toBe(w.hp[d]));
      }
    }
    // A bulky Wave: 15 creeps of twice the HP, and a Leak costs 2 lives.
    const bulky = waveRows({ length: 'full', difficulty: 'normal' })[27]!;
    expect(bulky.title).toMatch(/^15 /);
    expect(fact(bulky.sections[1]!, 'Leak')).toBe('2 lives; it walks the Lane again');
    expect(fact(waveRows({ length: 'full' })[0]!.sections[1]!, 'Leak')).toBe('1 life; it walks the Lane again');
  });

  it('gives the boss Waves their HP, count and Leak, and the Elementals their HP by level', () => {
    for (const d of ['normal', 'hard'] as const) {
      const boss = waveRows({ length: 'full', difficulty: d }).at(-1)!;
      const real = spawned('full', d, FULL_WAVES + 1);
      expect(plain(boss.summary!)).toBe(element.bossHp(d, 1, false));
      expect(fact(boss.sections[1]!, 'Boss Wave 2 HP')).toBe(element.bossHp(d, 2, false).toLocaleString('en-US'));
      expect(fact(boss.sections[0]!, 'Creeps')).toBe(`${real.count}, 4 of them bulky`);
    }
    expect(waveRows({ length: 'full', difficulty: 'normal' }).at(-1)!.summary).toBe('499,298 HP');
    for (const d of ['easy', 'insane'] as const) {
      const head = REF.waves({ length: 'full', difficulty: d }).groups.find((g) => g.id === 'elementals')!.head!;
      for (const level of [1, 2, 3]) {
        expect(plain(fact(head.sections[0]!, `Level ${level} HP`)!)).toBe(Math.floor(ELEMENTAL_HP[level - 1]! * DIFFICULTY_HP[d]));
      }
      expect(head.sections.slice(1).map((s) => s.title)).toEqual(ELEMENTS.map((e) => ELEMENT_CREEPS[`elemental-${e}-1`]!.name));
      // An Elemental takes damage as its own Element.
      expect(order(head.sections[1]!.ranks![0]!)[0]).toBe('Dark');
    }
    const express = REF.waves({ length: 'express' }).groups.find((g) => g.id === 'elementals')!.head!;
    expect(express.summary).toBe('None in Express');
  });
});

describe('the Towers tab', () => {
  it('has all 144 towers by kind, with the content\'s prices, damage and range', () => {
    const groups = REF.towers({}).groups;
    expect(groups.map((g) => g.id)).toEqual(['basic', 'elementalBasic', 'single', 'pure', 'dual', 'triple', 'periodic'].map((k) => `kind-${k}`));
    expect(groups.map((g) => g.rows.length)).toEqual([2, 12, 18, 6, 45, 60, 1]);
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.id).sort()).toEqual(TOWER_IDS.map((id) => `tower-${id}`).sort());
    for (const id of TOWER_IDS) {
      const spec = ELEMENT_TOWERS[id]!;
      const s = rows.find((r) => r.id === `tower-${id}`)!.sections[0]!;
      expect(plain((fact(s, 'Build') ?? fact(s, 'Upgrade')!).split(' gold')[0]!), id).toBe(spec.cost);
      expect(fact(s, 'Range'), id).toBe(spec.element.range.toLocaleString('en-US'));
      expect(fact(s, 'Deals'), id).toBe(nameOf(spec.element.damage));
      if (spec.element.baseDamage > 0) expect(fact(s, 'Damage'), id).toBe(spec.element.baseDamage.toLocaleString('en-US'));
      if (spec.element.totalCost !== spec.cost) expect(plain(fact(s, 'Total')!), id).toBe(spec.element.totalCost);
    }
    expect(fact(towerRow('tower-dark_tower').sections[0]!, 'Sells for')).toBe(`${Math.floor(175 * SELL.normal + 0.5)} gold · 175 in All Random`);
    expect(fact(towerRow('tower-pure_dark_tower').sections[0]!, 'Upgrade')).toBe('10,000 gold and 1 Pure Essence');
  });

  it('gives each tower its Element requirements, levels and upgrades', () => {
    const needs = (id: string): string | undefined => fact(towerRow(`tower-${id}`).sections[0]!, 'Needs');
    expect(needs('basic_arrow_tower')).toBe('nothing');
    expect(needs('water_arrow_tower')).toBe('Water 1');
    expect(needs('blacksmith_tower')).toBe('Fire 1 and Earth 1');
    expect(needs('blacksmith_tower_3')).toBe('Fire 3 and Earth 3');
    expect(needs('enchantment_tower_2')).toBe('Nature 2, Earth 2 and Light 2');
    // A Pure tower lists no levels of its own: it comes from the level-3 single.
    expect(ELEMENT_TOWERS['pure_dark_tower']!.element.requires).toEqual({});
    expect(needs('pure_dark_tower')).toBe('Dark 3');
    expect(needs('periodic_tower')).toBe('all six Elements at 1');
    const anvil = towerRow('tower-blacksmith_tower').sections[0]!;
    expect(fact(anvil, 'Elements')).toBe('Fire and Earth');
    expect(fact(anvil, 'From')!.split(' or ').sort()).toEqual([name('fire_tower'), name('earth_tower')].sort());
    expect(fact(anvil, 'Becomes')).toContain(`${name('blacksmith_tower_2')} (1,150 gold)`);
    expect(fact(towerRow('tower-focused_dark_tower').sections[0]!, 'Upgrades to')).toBe(`${name('refined_dark_tower')} (2,250 gold)`);
    expect(towerRow('tower-blacksmith_tower').tags!.map((t) => t.text)).toEqual(['Support']);
    expect(towerRow('tower-dark_tower').lead).toBe('L1');
    const dual = towerRow('kind-dual').sections[0]!;
    expect(fact(dual, 'Level 3')).toBe('2,500 gold or 4,250 gold');
    expect(fact(dual, 'From')).toBe('Singles');
  });

  it('says what each tower is strong and weak against, from the cycle', () => {
    const water = towerRow('tower-water_tower');
    const strong = water.sections.find((s) => s.title === 'Strong against')!;
    expect(strong.tags!.map((t) => t.text)).toEqual([`Fire ${pctOf(DAMAGE_TABLE.water.fire!)}`]);
    expect(strong.tags![0]!.about).toBe(`Waves ${ELEMENT_FULL_WAVES.filter((w) => w.element === 'fire').map((w) => w.wave).join(', ')}`);
    const weak = water.sections.find((s) => s.title === 'Weak against')!;
    expect(weak.tags!.map((t) => t.text)).toEqual(['Dark 50%', 'Composite 90%']);
    const arrow = towerRow('tower-basic_arrow_tower');
    expect(arrow.sections.find((s) => s.title === 'Strong against')!.tags!.map((t) => t.text)).toEqual(['Every Element 100%']);
    // Express names its own Waves.
    const express = REF.towers({ length: 'express' }).groups.find((g) => g.id === 'kind-single')!.rows.find((r) => r.id === 'tower-water_tower')!;
    expect(express.sections.find((s) => s.title === 'Strong against')!.tags![0]!.about)
      .toBe(`Waves ${ELEMENT_EXPRESS_WAVES.filter((w) => w.element === 'fire').map((w) => w.wave).join(', ')}`);
  });
});

describe('in a Run', () => {
  it('opens on the Run\'s length and Difficulty, both locked', () => {
    const s = newElementRun({ length: 'express', difficulty: 'hard' });
    const ctx = { view: viewOf(s) };
    const values = REF.defaults(ctx);
    expect(values).toEqual({ length: 'express', difficulty: 'hard' });
    const filters = REF.filters(values, ctx);
    expect(filters.map((f) => [f.id, f.value, f.locked])).toEqual([['length', 'express', 'Fixed for this Run'], ['difficulty', 'hard', 'Fixed for this Run']]);
    expect(waveRows(values)).toHaveLength(EXPRESS_WAVES);
    expect(REF.filters(REF.defaults({}), {}).every((f) => f.locked === undefined)).toBe(true);
    expect(REF.defaults({})).toEqual({ length: 'full', difficulty: 'normal' });
  });

  it('marks the Wave being fought, or the one the Break counts down to, and the next', () => {
    const s = newElementRun({ length: 'full' });
    const current = (run: ElementRun = s): ReturnType<NonNullable<typeof REF.current>> => REF.current!(viewOf(run), REF.defaults({ view: viewOf(run) }));
    expect(element.elementStatus(s).step).toBe('break');
    expect(current()).toEqual({ now: 'wave-1', next: 'wave-2' });
    send(s, { type: 'element.sendNow' });
    expect(current()).toEqual({ now: 'wave-1', next: 'wave-2' });
    s.wave.number = FULL_WAVES - 1;
    s.phase = 'build';
    s.mode.breakUntil = s.tick + 100;
    expect(current()).toEqual({ now: `wave-${FULL_WAVES}`, next: 'boss' });
    send(s, { type: 'element.sendNow' });
    expect(current()).toEqual({ now: `wave-${FULL_WAVES}`, next: 'boss' });
    s.wave.number = FULL_WAVES + 2;
    expect(current()).toEqual({ now: 'boss', next: null });
    const x = newElementRun({ length: 'express' });
    x.wave.number = EXPRESS_WAVES - 1;
    send(x, { type: 'element.sendNow' });
    expect(current(x)).toEqual({ now: `wave-${EXPRESS_WAVES}`, next: null });
    s.phase = 'lost';
    expect(current()).toEqual({ now: null, next: null });
  });
});

import { describe, expect, it } from 'vitest';
import {
  CHALLENGES, DAMAGE_TABLE, FAMILIES, FAMILY_BASE, ORIGINAL_CREEPS, ORIGINAL_TOWERS, STAGES, challengeOfStage,
} from '../src/content/original';
import { createRun, original, step, type Difficulty, type GameState } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { ORIGINAL_UI } from '../src/ui/modes/original';
import { bestAgainst, familyLine, pickOf } from '../src/ui/modes/original/reference';
import type { ReferenceRank, ReferenceRow, ReferenceSection, ReferenceValues } from '../src/ui/reference/types';

// The Original's Waves & Towers sheet: Best against from its damage table and
// rules, every Wave of every Stage with numbers as the sim makes them, the
// Challenge toggle, the towers of each family, and Now and Next in a Run.

const REF = ORIGINAL_UI.reference!;

function viewOf(state: GameState): RunView {
  return { state, side: 0, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

function run(stage: number, difficulty: Difficulty = 'normal', challenge?: string): GameState {
  const options: Record<string, unknown> = { stage, talents: [], cleared: 12, ...(challenge ? { challenge } : {}) };
  return createRun({ mode: 'original', seed: 1, difficulty, options: options as never });
}

const order = (r: ReferenceRank): string[] => r.items.map((i) => i.text);
const rankOf = (r: ReferenceRank, text: string): number => r.items.find((i) => i.text === text)!.rank;
const fact = (s: ReferenceSection, key: string): string | undefined => s.facts?.find(([k]) => k === key)?.[1];
const plain = (s: string): number => Number(s.replace(/[^\d.]/g, ''));

function waveRows(values: ReferenceValues): readonly ReferenceRow[] {
  return REF.waves(values).groups[0]!.rows;
}

describe('Best against', () => {
  it('puts Magic and Poison above Siege and Pierce on an Armored creep', () => {
    const b = bestAgainst('revenant').damage;
    expect(order(b)).toEqual(['Magic', 'Poison', 'Siege', 'Pierce']);
    expect(rankOf(b, 'Magic')).toBe(1);
    expect(rankOf(b, 'Poison')).toBe(1);
    expect(b.items.map((i) => i.value)).toEqual(['100%', '100%', '75%', '50%']);
    // The family list follows, and names the Arrow Specialisation that pierces armor.
    const fams = bestAgainst('revenant').families;
    expect(order(fams).at(-1)).toBe('Arrow');
    expect(fams.items.at(-1)!.why).toEqual(['Deadeye Perch hits it as Unarmored']);
  });

  it('puts Magic last on a Warded creep', () => {
    const b = bestAgainst('cultist').damage;
    expect(order(b).at(-1)).toBe('Magic');
    expect(b.items.at(-1)!.value).toBe('50%');
    expect(order(bestAgainst('cultist').families).slice(-2).sort()).toEqual(['Arcane', 'Frost']);
  });

  it('puts Poison first on every boss, and Frost last, since bosses take half slows', () => {
    for (const boss of ['gravelord', 'plague_mother', 'riftlord']) {
      const b = bestAgainst(boss);
      expect(order(b.damage)[0], boss).toBe('Poison');
      expect(rankOf(b.damage, 'Poison'), boss).toBe(1);
      expect(rankOf(b.damage, 'Siege'), boss).toBe(2);
      expect(order(b.families)[0], boss).toBe('Poison');
      expect(order(b.families).at(-1), boss).toBe('Frost');
      expect(b.families.items.at(-1)!.why![0], boss).toMatch(/bosses take slows at 50%/);
    }
  });

  it('leaves out what can\'t hit a flyer: Poison, and the Cannon family but for Flak Battery', () => {
    const bat = bestAgainst('bloodbat');
    expect(order(bat.damage)).toEqual(['Pierce', 'Siege', 'Magic']);
    expect(bat.damage.note).toBe('Can\'t hit air: Poison');
    expect(bat.damage.items.find((i) => i.text === 'Siege')!.why).toEqual(['only Flak Battery hits air']);
    expect(order(bat.families)).toEqual(['Arrow', 'Frost', 'Arcane']);
    expect(bat.families.note).toBe('Can\'t hit air: Cannon (Flak Battery can), Poison');
    // An armored flyer: Magic first, and still no Poison.
    expect(order(bestAgainst('gargoyle').damage)).toEqual(['Magic', 'Siege', 'Pierce']);
    // A ground creep keeps every family.
    expect(order(bestAgainst('ghoul').families)).toHaveLength(5);
  });

  it('ranks Poison up alone on a Shield, which its poison over time ignores', () => {
    const ghoul = bestAgainst('ghoul').damage;
    expect(ghoul.items.every((i) => i.rank === 1)).toBe(true);
    const shield = bestAgainst('shieldbearer');
    expect(order(shield.damage)[0]).toBe('Poison');
    expect(rankOf(shield.damage, 'Poison')).toBe(1);
    expect(rankOf(shield.damage, 'Pierce')).toBe(2);
    expect(shield.damage.items[0]!.why).toEqual(['poison over time ignores its Shield']);
    expect(order(shield.families)[0]).toBe('Poison');
  });

  it('follows the rules for speed and swarms: Frost first on Hounds, Cannon\'s splash first on Crawlers', () => {
    expect(order(bestAgainst('hound').families)[0]).toBe('Frost');
    expect(order(bestAgainst('crawler').families)[0]).toBe('Cannon');
  });

  it('reads every share from the damage table', () => {
    for (const [id, spec] of Object.entries(ORIGINAL_CREEPS)) {
      for (const item of bestAgainst(id).damage.items) {
        const type = item.text.toLowerCase() as keyof typeof DAMAGE_TABLE;
        expect(item.value, `${id} ${type}`).toBe(`${DAMAGE_TABLE[type][spec.armorType] * 100}%`);
      }
    }
  });
});

describe('the Waves tab', () => {
  it('lists every Wave of every Stage, in order, with each group\'s count, route and Threat', () => {
    for (const stage of STAGES) {
      const rows = waveRows({ stage: String(stage.number) });
      expect(rows.map((r) => r.id)).toEqual(stage.waves.map((_, i) => `wave-${i + 1}`));
      rows.forEach((row, i) => {
        const wave = stage.waves[i]!;
        const [head, ...groups] = row.sections;
        expect(fact(head!, 'Threat')).toBe(String(stage.threat + i));
        expect(plain(fact(head!, 'Creeps')!)).toBe(wave.groups.reduce((n, g) => n + g.count, 0));
        expect(groups).toHaveLength(wave.groups.length);
        groups.forEach((s, k) => {
          const g = wave.groups[k]!;
          expect(s.title, `${stage.name} ${row.id}`).toContain(`${g.count} × ${ORIGINAL_CREEPS[g.creep]!.name}`);
          if (stage.map.routes!.length > 1) expect(s.title).toContain(`Route ${(g.route ?? 0) + 1}`);
          expect(fact(s, 'Armor')).toBe(ORIGINAL_CREEPS[g.creep]!.armorType.replace(/^./, (c) => c.toUpperCase()));
          expect(fact(s, 'Speed')).toBe(String(ORIGINAL_CREEPS[g.creep]!.speed));
        });
      });
    }
  });

  it('gives each creep the HP, bounty and Shield a Run of that Stage and Difficulty spawns with', () => {
    for (const [stage, difficulty] of [[1, 'easy'], [5, 'hard'], [12, 'insane']] as const) {
      const state = run(stage, difficulty);
      const rows = waveRows({ stage: String(stage), difficulty });
      rows.forEach((row, i) => {
        const w = original.wavePreview(state, i + 1)!;
        row.sections.slice(1).forEach((s, k) => {
          expect(plain(fact(s, 'HP')!), `Stage ${stage} ${row.id}`).toBe(w.groups[k]!.hp);
          const bounty = fact(s, 'Bounty')!;
          expect(bounty === 'none' ? 0 : plain(bounty)).toBe(w.groups[k]!.bounty);
        });
      });
    }
    // A Shieldbearer's Shield is the one it spawns with, a share of a Ghoul's HP at its Threat.
    const chapel = STAGES.find((s) => s.waves.some((w) => w.groups.some((g) => g.creep === 'shieldbearer')))!;
    const n = chapel.waves.findIndex((w) => w.groups.some((g) => g.creep === 'shieldbearer'));
    const section = waveRows({ stage: String(chapel.number), difficulty: 'hard' })[n]!.sections.find((s) => s.title?.includes('Shieldbearer'))!;
    const threat = chapel.threat + n;
    expect(fact(section, 'Shield')).toBe(`${original.shieldAt(ORIGINAL_CREEPS['shieldbearer']!.original.shield!, threat, 1.3)} a hit`);
  });

  it('shows the Stage\'s gold, lives and Breaks, and with the Challenge toggle its rule and changes', () => {
    const mill = REF.waves({ stage: '1' });
    expect(mill.intro!.map((t) => t.text)).toEqual(['12 Waves', 'Threat 1–12', '250 gold', '20 lives', 'Breaks 30 s']);
    expect(mill.note).toBeUndefined();
    const burnt = REF.waves({ stage: '1', challenge: '1' });
    expect(burnt.note).toBe(`The Burnt Mill: ${challengeOfStage(1)!.rule}`);
    expect(burnt.intro!.filter((t) => t.tone === 'bad').map((t) => t.text)).toEqual(['Burnt ground: Lower bend and west burnt', 'Tower cap 4']);
    const rope = REF.waves({ stage: '3', challenge: '1' }).intro!.map((t) => t.text);
    expect(rope).toContain('10 lives');
    expect(rope).not.toContain('20 lives');
    expect(rope).toContain('Tier 2 at most');
    expect(REF.waves({ stage: '8', challenge: '1' }).intro!.map((t) => t.text)).toEqual(expect.arrayContaining(['430 gold', 'Send now pays no gold']));
    expect(REF.waves({ stage: '7', challenge: '1' }).intro!.map((t) => t.text)).toEqual(expect.arrayContaining(['Breaks 8 s', '17 lives']));
    expect(REF.waves({ stage: '6', challenge: '1' }).intro!.map((t) => t.text)).toEqual(expect.arrayContaining(['No Specialisations', '350 gold']));
    // Every Challenge's modifiers show as at least one chip.
    for (const c of CHALLENGES) {
      const bad = REF.waves({ stage: String(c.stage), challenge: '1' }).intro!.filter((t) => t.tone === 'bad');
      expect(bad.length, c.name).toBe(Object.keys(c.modifiers).length);
    }
  });

  it('applies the Challenge\'s HP rule to the numbers, at Normal whatever Difficulty was picked', () => {
    const cold = challengeOfStage(2)!;
    expect(cold.modifiers.hp).toBe(1.44);
    const off = waveRows({ stage: '2', difficulty: 'hard' });
    const on = waveRows({ stage: '2', challenge: '1', difficulty: 'hard' });
    expect(pickOf({ stage: '2', challenge: '1', difficulty: 'hard' }).difficulty).toBe('normal');
    const state = run(2, 'normal', cold.id);
    on.forEach((row, i) => {
      const w = original.wavePreview(state, i + 1)!;
      row.sections.slice(1).forEach((s, k) => expect(plain(fact(s, 'HP')!)).toBe(w.groups[k]!.hp));
    });
    // Tougher than the Stage on Normal, and the Stage on Hard (×1.3) stays below the Challenge's ×1.44.
    const normal = waveRows({ stage: '2' });
    const hp = (rows: readonly ReferenceRow[]): number => plain(fact(rows.at(-1)!.sections[1]!, 'HP')!);
    expect(hp(on)).toBeGreaterThan(hp(off));
    expect(hp(off)).toBeGreaterThan(hp(normal));
    // The Difficulty filter is locked to Normal while the toggle is on.
    const diff = REF.filters({ stage: '2', challenge: '1', difficulty: 'hard' }, {}).find((f) => f.id === 'difficulty')!;
    expect(diff).toMatchObject({ value: 'normal', locked: 'Challenges play Normal' });
  });

  it('tags Air, Boss and Swarm creeps and lists the boss\'s behaviour', () => {
    const fort = STAGES[3]!;
    const last = waveRows({ stage: '4' }).at(-1)!;
    expect(fort.waves.at(-1)!.groups.some((g) => g.creep === 'gravelord')).toBe(true);
    expect(last.tags!.map((t) => t.text)).toContain('Boss');
    const lord = last.sections.find((s) => s.title?.includes('Gravelord'))!;
    expect(lord.lines!.join(' ')).toMatch(/enrages/);
    expect(lord.ranks!.map((r) => r.label)).toEqual(['Best against', 'Families']);
    const bats = STAGES.flatMap((s) => waveRows({ stage: String(s.number) })).find((r) => r.title.includes('Bloodbat'))!;
    expect(bats.tags!.find((t) => t.text === 'Air')!.tone).toBe('air');
    const crawlers = STAGES.flatMap((s) => waveRows({ stage: String(s.number) })).find((r) => r.title.includes('Crawler'))!;
    expect(crawlers.tags!.map((t) => t.text)).toContain('Swarm');
  });
});

describe('the Towers tab', () => {
  it('lists every family\'s Tiers 1–3 and both Specialisations with the table\'s prices and hits', () => {
    const tab = REF.towers({ stage: '1' });
    expect(tab.groups.map((g) => g.id)).toEqual(FAMILIES.map((f) => `family-${f}`));
    let seen = 0;
    for (const g of tab.groups) {
      const family = g.id.replace('family-', '') as (typeof FAMILIES)[number];
      expect(g.rows.map((r) => r.id)).toEqual(familyLine(family).map((id) => `tower-${id}`));
      expect(g.rows.map((r) => r.lead)).toEqual(['T1', 'T2', 'T3', 'Spec', 'Spec']);
      expect(familyLine(family)[0]).toBe(FAMILY_BASE[family]);
      for (const row of g.rows) {
        const spec = ORIGINAL_TOWERS[row.id.replace('tower-', '')]!;
        const s = row.sections[0]!;
        expect(fact(s, spec.original.tier === 1 ? 'Build' : 'Upgrade')).toBe(`${spec.original.price} gold`);
        expect(fact(s, 'Total')).toBe(`${spec.original.total} gold`);
        if (spec.attack && !spec.original.beam) {
          expect(fact(s, 'Damage')).toBe(String(spec.attack.damage[0]));
          expect(fact(s, 'Range')).toBe(String(spec.attack.range));
          expect(fact(s, 'Hits')).toBe(spec.attack.targets === 'both' ? 'Ground and air' : 'Ground only');
        }
        seen++;
      }
    }
    expect(seen).toBe(Object.keys(ORIGINAL_TOWERS).length);
  });

  it('gives each family its unlock, Perks, Level bonus and Strong / Weak against', () => {
    const groups = REF.towers({ stage: '1' }).groups;
    const head = (f: string): ReferenceRow => groups.find((g) => g.id === `family-${f}`)!.head!;
    expect(fact(head('arrow').sections[0]!, 'Opens')).toBe('From the start');
    expect(fact(head('frost').sections[0]!, 'Opens')).toBe('Win Stage 1');
    expect(fact(head('totem').sections[0]!, 'Opens')).toBe('Win Stage 6');
    expect(fact(head('arrow').sections[0]!, 'Tier 3')).toBe('Win Stage 2');
    expect(fact(head('arrow').sections[0]!, 'Specialisations')).toBe('Win Stage 5');
    // A family opened later opens its Tier 3 with it.
    expect(fact(head('totem').sections[0]!, 'Tier 3')).toBe('Win Stage 6');
    const levels = head('cannon').sections.find((s) => s.title === 'Tower Levels')!.lines!;
    expect(levels).toEqual([
      'Each Tower Level above 1: +3% damage, up to Level 10',
      'Level 5: Wide Blast, +25% splash radius',
      'Level 10: Double Charge, every 3rd shot fires a second shell at another creep',
    ]);
    const weak = (f: string): string[] => head(f).sections.find((s) => s.title === 'Weak against')!.tags!.map((t) => t.text);
    const strong = (f: string): string[] => head(f).sections.find((s) => s.title === 'Strong against')!.tags!.map((t) => t.text);
    expect(weak('arrow')).toEqual(['Armored 50%', 'Boss 70%']);
    expect(weak('cannon')).toEqual(['Armored 75%', 'Boss 85%', 'Air']);
    expect(weak('arcane')).toEqual(['Warded 50%', 'Boss 70%']);
    expect(strong('poison')).toEqual(['Every armor 100%']);
    expect(weak('poison')).toEqual(['Air']);
    // Deadeye Perch hits Armored creeps as if Unarmored.
    const deadeye = groups[0]!.rows.find((r) => r.id === 'tower-deadeye_perch')!;
    expect(deadeye.sections.find((s) => s.title === 'Strong against')!.tags!.map((t) => t.text)).toContain('Armored 100%');
  });

  it('dims what the Challenge shown keeps out: families, Tiers past its cap and Specialisations', () => {
    const cold = REF.towers({ stage: '2', challenge: '1' });
    const off = (g: number): string | undefined => cold.groups[g]!.head!.off;
    expect(off(0)).toBe('Not allowed in Cold Water');
    expect(off(1)).toBeUndefined();
    const rope = REF.towers({ stage: '3', challenge: '1' }).groups[0]!.rows.map((r) => r.off ?? null);
    expect(rope).toEqual([null, null, 'Short Rope stops at Tier 2', 'Short Rope stops at Tier 2', 'Short Rope stops at Tier 2']);
    const rites = REF.towers({ stage: '6', challenge: '1' }).groups[2]!.rows.map((r) => r.off ?? null);
    expect(rites).toEqual([null, null, null, 'No Specialisations in The Old Rites', 'No Specialisations in The Old Rites']);
    expect(REF.towers({ stage: '2' }).groups.every((g) => !g.head!.off && g.rows.every((r) => !r.off))).toBe(true);
  });
});

describe('in a Run', () => {
  it('opens on the Run\'s Stage, Challenge and Difficulty, with Difficulty fixed', () => {
    const view = viewOf(run(5, 'hard'));
    expect(REF.defaults({ view })).toEqual({ stage: '5', challenge: '0', difficulty: 'hard' });
    const diff = REF.filters(REF.defaults({ view }), { view }).find((f) => f.id === 'difficulty')!;
    expect(diff).toMatchObject({ value: 'hard', locked: 'Fixed for this Run' });
    const challenge = viewOf(run(1, 'normal', 'burnt-mill'));
    expect(REF.defaults({ view: challenge })).toEqual({ stage: '1', challenge: '1', difficulty: 'normal' });
    // From the war map it opens on the Stage picked there.
    expect(REF.defaults({ from: { stage: '9' } })).toEqual({ stage: '9', challenge: '0', difficulty: 'normal' });
  });

  it('marks the Wave being fought as Now and the one after as Next', () => {
    const state = run(1);
    const view = viewOf(state);
    const values = REF.defaults({ view });
    expect(REF.current!(view, values)).toEqual({ now: null, next: 'wave-1' });
    step(state, [{ type: 'original.sendNow' }]);
    expect(state.wave.number).toBe(1);
    expect(REF.current!(view, values)).toEqual({ now: 'wave-1', next: 'wave-2' });
    step(state, [{ type: 'original.sendNow' }]);
    expect(REF.current!(view, values)).toEqual({ now: 'wave-1', next: 'wave-2' });
    // Another Stage picked: nothing to mark.
    expect(REF.current!(view, { ...values, stage: '2' })).toEqual({ now: null, next: null });
    // The last Wave has no Next.
    (state.wave as { number: number }).number = state.wave.total;
    expect(REF.current!(view, values)).toEqual({ now: 'wave-12', next: null });
  });
});

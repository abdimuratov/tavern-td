import { describe, expect, it } from 'vitest';
import {
  AIR_WAVES, ARMOR_TYPES, ATTACK_TYPES, MAUL_CREEPS, MAUL_DAMAGE_TABLE, MAUL_TOWERS, MAUL_WAVES, RACE_SPECS, RACES, SELL_SHARE,
  type AttackType, type RaceId,
} from '../src/content/maul';
import { createRun, maul, step, type Difficulty, type GameState } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { MAUL_UI } from '../src/ui/modes/maul';
import { bestAgainst, lineOf, raceTowers } from '../src/ui/modes/maul/reference';
import type { ReferenceRank, ReferenceRow, ReferenceSection, ReferenceValues } from '../src/ui/reference/types';

// Maul's Waves & Towers sheet: Best against from its attack table and rules,
// the 40 Waves with the numbers a real Run spawns, the four Races' towers with
// the table's prices, and Now and Next in a Run.

const REF = MAUL_UI.reference!;
const ALL: readonly RaceId[] = RACES;

function viewOf(state: GameState): RunView {
  return { state, side: 0, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

function run(difficulty: Difficulty = 'normal', race: RaceId = 'ironclad'): maul.MaulGameState {
  return createRun({ mode: 'maul', seed: 1, difficulty, options: { race } as never }) as maul.MaulGameState;
}

const order = (r: ReferenceRank): string[] => r.items.map((i) => i.text);
const rankOf = (r: ReferenceRank, text: string): number => r.items.find((i) => i.text === text)!.rank;
const fact = (s: ReferenceSection, key: string): string | undefined => s.facts?.find(([k]) => k === key)?.[1];
const plain = (s: string): number => Number(s.replace(/[^\d.]/g, ''));
const pctOf = (share: number): string => `${share * 100}%`;
const t1 = (race: RaceId, line: 'a' | 'b'): string => MAUL_TOWERS[lineOf(race, line)[0]!]!.name;

function waveRows(values: ReferenceValues): readonly ReferenceRow[] {
  return REF.waves(values).groups[0]!.rows;
}

describe('Best against', () => {
  it('reads every attack type\'s share from the attack table, with poison at 100% everywhere', () => {
    for (const [id, spec] of Object.entries(MAUL_CREEPS)) {
      const b = bestAgainst(spec, ALL).attacks;
      for (const item of b.items) {
        const type = item.text.toLowerCase();
        const share = type === 'poison' ? 1 : MAUL_DAMAGE_TABLE[type as AttackType][spec.armorType];
        expect(item.value, `${id} ${type}`).toBe(pctOf(share));
      }
      // The table's favourite comes first on every armor type a single attack hits hardest.
      const best = Math.max(...ATTACK_TYPES.map((a) => MAUL_DAMAGE_TABLE[a][spec.armorType]));
      const top = ATTACK_TYPES.filter((a) => MAUL_DAMAGE_TABLE[a][spec.armorType] === best);
      if (best > 1 && top.length === 1) {
        expect(order(b)[0], id).toBe(top[0]!.replace(/^./, (c) => c.toUpperCase()));
        expect(rankOf(b, order(b)[0]!), id).toBe(1);
      }
    }
  });

  it('puts each armor\'s favourite first: Pierce on Light, Frost on Medium, Magic on Heavy, Siege on Fortified', () => {
    const first = (creep: string): string => order(bestAgainst(MAUL_CREEPS[creep]!, ALL).attacks)[0]!;
    expect(first('snowling')).toBe('Pierce');
    expect(first('raider')).toBe('Frost');
    expect(first('brute')).toBe('Magic');
    expect(first('golem')).toBe('Siege');
    // Fortified takes half from Pierce and Magic, which come last together.
    const golem = bestAgainst(MAUL_CREEPS['golem']!, ALL).attacks;
    expect(order(golem).slice(-2).sort()).toEqual(['Magic', 'Pierce']);
    expect(rankOf(golem, 'Pierce')).toBe(rankOf(golem, 'Magic'));
    // Poison skips the Golem's armor, so it ranks above Chaos at the same 100%.
    expect(rankOf(golem, 'Poison')).toBeLessThan(rankOf(golem, 'Chaos'));
    expect(golem.items.find((i) => i.text === 'Poison')!.why).toEqual([`poison skips its ${MAUL_CREEPS['golem']!.armor} armor`]);
  });

  it('puts poison first on every boss, whose Hero armor takes every attack alike, and slows last', () => {
    for (const boss of ['warlord', 'mammoth', 'colossus', 'winter_king']) {
      const spec = MAUL_CREEPS[boss]!;
      const b = bestAgainst(spec, ALL);
      expect(ARMOR_TYPES).toContain(spec.armorType);
      expect(b.attacks.items.every((i) => i.value === '100%'), boss).toBe(true);
      expect(order(b.attacks)[0], boss).toBe('Poison');
      expect(rankOf(b.attacks, 'Poison'), boss).toBe(1);
      expect(rankOf(b.attacks, 'Chaos'), boss).toBe(2);
      // Mirefolk's venom and spores come first, Rimeborn's slows last.
      expect(order(b.lines).slice(0, 2).sort(), boss).toEqual([t1('mirefolk', 'a'), t1('mirefolk', 'b')].sort());
      expect(order(b.lines).slice(-2).sort(), boss).toEqual([t1('rimeborn', 'a'), t1('rimeborn', 'b')].sort());
      expect(b.lines.items.at(-1)!.why![0], boss).toMatch(/bosses can't be slowed below 50% speed/);
    }
  });

  it('leaves out what can\'t hit a flyer: Siege, and the Mortar and Spore Pod lines', () => {
    const harpy = bestAgainst(MAUL_CREEPS['harpy']!, ALL);
    expect(order(harpy.attacks)).not.toContain('Siege');
    expect(harpy.attacks.note).toBe('Can\'t hit air: Siege');
    expect(harpy.attacks.items.find((i) => i.text === 'Chaos')!.why).toEqual(['only Void Rune hits air']);
    expect(harpy.attacks.items.find((i) => i.text === 'Poison')!.why).toEqual(['only the Dart Tower line hits air']);
    expect(order(harpy.lines)).toHaveLength(6);
    expect(harpy.lines.note).toBe('Can\'t hit air: Mortar, Spore Pod');
    // Every ground line counts against a ground creep.
    expect(order(bestAgainst(MAUL_CREEPS['raider']!, ALL).lines)).toHaveLength(8);
    // Lines that can hit air are exactly those whose Tier 1 and Tier 2 do.
    const air = ALL.flatMap((r) => (['a', 'b'] as const).filter((l) => lineOf(r, l).slice(0, 2).every((id) => MAUL_TOWERS[id]!.attack!.targets !== 'ground')).map((l) => t1(r, l)));
    expect(order(harpy.lines).sort()).toEqual(air.sort());
  });

  it('follows Maul\'s rules on ties: slows up on Sleet Hounds and down on Hollows, splash and spores up on Snowlings', () => {
    const hound = bestAgainst(MAUL_CREEPS['frost_wolf']!, ALL).lines;
    const frost = t1('rimeborn', 'a');
    const glyph = t1('runecasters', 'b');
    expect(rankOf(hound, frost)).toBeLessThan(rankOf(hound, glyph));
    expect(hound.items.find((i) => i.text === frost)!.why).toEqual(['its slows hold it back']);
    const hollow = bestAgainst(MAUL_CREEPS['wraith']!, ALL).lines;
    const totem = t1('rimeborn', 'b');
    expect(order(hollow).at(-1)).toBe(totem);
    expect(hollow.items.at(-1)!.why).toEqual(['slows can\'t touch it']);
    const swarm = bestAgainst(MAUL_CREEPS['snowling']!, ALL).lines;
    // Among the lines at 100%, the ones that splash or spread rank first.
    const even = swarm.items.filter((i) => i.value === '100%');
    expect(even.slice(0, 2).map((i) => i.text).sort()).toEqual([t1('mirefolk', 'b'), glyph].sort());
    expect(swarm.items.find((i) => i.text === t1('ironclad', 'a'))!.why).toEqual(['Repeater hits several at once']);
    // Void Rune hits a Golem as Chaos, though its line's Magic takes half.
    const golem = bestAgainst(MAUL_CREEPS['golem']!, ALL).lines;
    expect(golem.items.find((i) => i.text === t1('runecasters', 'a'))!.why).toEqual(['Void Rune hits it as Chaos, 100%']);
  });

  it('ranks only the lines of the Races picked', () => {
    const b = bestAgainst(MAUL_CREEPS['raider']!, ['ironclad']);
    expect(order(b.lines)).toEqual([t1('ironclad', 'a'), t1('ironclad', 'b')]);
    const rows = waveRows({ race: 'mirefolk+runecasters' });
    const lines = rows[0]!.sections[1]!.ranks![1]!;
    expect(order(lines).sort()).toEqual([t1('mirefolk', 'a'), t1('mirefolk', 'b'), t1('runecasters', 'a'), t1('runecasters', 'b')].sort());
  });
});

describe('the Waves tab', () => {
  it('lists the 40 Waves in order with their creeps, Gates, gold, and Air and Boss marks', () => {
    const rows = waveRows({});
    expect(rows.map((r) => r.id)).toEqual(MAUL_WAVES.map((_, i) => `wave-${i + 1}`));
    rows.forEach((row, i) => {
      const n = i + 1;
      const w = MAUL_WAVES[i]!;
      const [head, ...groups] = row.sections;
      const per = MAUL_CREEPS[w.creep]!.maul.perSpawn;
      expect(plain(fact(head!, 'Creeps')!)).toBe(2 * (per + (w.escort?.count ?? 0)));
      expect(fact(head!, 'Gates')).toBe('West and East');
      expect(fact(head!, 'Bounty pool')).toBe(`${maul.bountyPool(n)} gold`);
      expect(fact(head!, 'Wave bonus')).toBe(`${maul.waveBonus(n)} gold`);
      // Full interest is the least gold held that earns the whole cap, which is the bonus.
      const full = plain(fact(head!, 'Full interest')!);
      expect(maul.interestOn(full, n)).toBe(maul.waveBonus(n));
      expect(maul.interestOn(full - 1, n)).toBeLessThan(maul.waveBonus(n));
      expect(groups[0]!.title).toBe(`${2 * per} × ${MAUL_CREEPS[w.creep]!.name} · ${per} from each Gate`);
      if (w.escort) expect(groups[1]!.title).toBe(`${2 * w.escort.count} × ${MAUL_CREEPS[w.escort.creep]!.name} · ${w.escort.count} from each Gate`);
      const tags = row.tags!.map((t) => t.text);
      expect(tags.includes('Air'), row.id).toBe(AIR_WAVES.includes(n));
      expect(tags.includes('Boss') || tags.includes('Last boss'), row.id).toBe(MAUL_CREEPS[w.creep]!.maul.kind === 'boss');
    });
    expect(rows.at(-1)!.tags!.map((t) => t.text)).toContain('Last boss');
    expect(fact(rows.at(-1)!.sections[1]!, 'Leak')).toBe('the Run');
    expect(fact(rows[9]!.sections[1]!, 'Leak')).toBe(`${MAUL_CREEPS['warlord']!.maul.lives} lives`);
    expect(fact(rows[6]!.sections[1]!, 'Armor')).toBe(`Heavy ${MAUL_CREEPS['brute']!.armor}`);
  });

  it('gives each creep the HP of a Run on that Difficulty, as the sim previews and spawns it', () => {
    for (const difficulty of ['easy', 'hard', 'insane'] as const) {
      const state = run(difficulty);
      const rows = waveRows({ difficulty });
      rows.forEach((row, i) => {
        const w = maul.wavePreview(state, i + 1)!;
        row.sections.slice(1).forEach((s, k) => {
          expect(plain(fact(s, 'HP')!), `${difficulty} ${row.id}`).toBe(w.groups[k]!.hp);
          expect(fact(s, 'Speed')).toBe(String(MAUL_CREEPS[w.groups[k]!.creep]!.speed));
        });
      });
      // Wave 1's Brawlers spawn with that HP, and each pays the bounty shown.
      step(state, [{ type: 'maul.sendNow' }]);
      step(state, []);
      const brawler = state.creeps[0]!;
      const s = rows[0]!.sections[1]!;
      expect(brawler.maxHp).toBe(plain(fact(s, 'HP')!));
      const rate = state.mode.bountyRate['1']!;
      expect(plain(fact(s, 'Bounty')!)).toBe(Math.round(brawler.maxHp * rate) / 100);
      expect(rate).toBe(maul.bountyRate(1, rows[0]!.sections.slice(1).reduce((n, x) => n + plain(x.title!.split(' × ')[0]!) * plain(fact(x, 'HP')!), 0)));
    }
    // Hard has more HP than Normal, Easy less.
    const hp = (d: Difficulty): number => plain(fact(waveRows({ difficulty: d })[20]!.sections[1]!, 'HP')!);
    expect(hp('easy')).toBeLessThan(hp('normal'));
    expect(hp('hard')).toBeGreaterThan(hp('normal'));
  });

  it('splits a boss Wave\'s pool by HP: the boss carries more than its escort', () => {
    const row = waveRows({})[9]!;
    const [boss, escort] = [row.sections[1]!, row.sections[2]!];
    expect(plain(fact(boss, 'Bounty')!)).toBeGreaterThan(plain(fact(escort, 'Bounty')!));
    const total = plain(fact(boss, 'Bounty')!) * 2 + plain(fact(escort, 'Bounty')!) * 10;
    expect(total).toBeCloseTo(maul.bountyPool(10), 1);
  });
});

describe('the Towers tab', () => {
  it('lists each Race\'s Wall and both lines with the table\'s prices, totals, damage and forks', () => {
    const tab = REF.towers({});
    expect(tab.groups.map((g) => g.id)).toEqual(RACES.map((r) => `race-${r}`));
    let seen = 0;
    for (const g of tab.groups) {
      const race = g.id.replace('race-', '') as RaceId;
      expect(g.rows.map((r) => r.id)).toEqual(raceTowers(race).map((id) => `tower-${id}`));
      expect(g.rows.map((r) => r.lead)).toEqual(['Wall', 'T1', 'T2', 'T3', 'T3', 'T1', 'T2', 'T3', 'T3']);
      for (const row of g.rows) {
        const id = row.id.replace('tower-', '');
        const spec = MAUL_TOWERS[id]!;
        const m = spec.maul;
        const s = row.sections[0]!;
        if (m.tier <= 1) expect(fact(s, 'Build')).toBe(`${m.total} gold`);
        if (m.tier === 1) expect(fact(s, 'From a Wall')).toBe(`${m.price} gold`);
        if (m.tier >= 2) expect([fact(s, 'Upgrade'), fact(s, 'Total')]).toEqual([`${m.price} gold`, `${m.total} gold`]);
        if (spec.attack) {
          expect(fact(s, 'Damage')).toBe(`${spec.attack.damage[0]}–${spec.attack.damage[1]}`);
          expect(fact(s, 'Range')).toBe(String(spec.attack.range));
          expect(fact(s, 'Hits')).toBe(spec.attack.targets === 'both' ? 'Ground and air' : 'Ground only');
        }
        expect(fact(s, 'Sells for')).toBe(`${Math.floor(m.total * SELL_SHARE)} gold (75%) · ${m.total} if bought this Break`);
        if (m.tier === 0) expect(fact(s, 'Becomes')).toMatch(new RegExp(`^${MAUL_TOWERS[RACE_SPECS[race].builds[1]]!.name} or ${MAUL_TOWERS[RACE_SPECS[race].builds[2]]!.name}`));
        if (m.tier === 2) expect(fact(s, 'Forks into')).toMatch(new RegExp(`^${m.next.map((n) => MAUL_TOWERS[n]!.name).join(' or ')}`));
        const ground = (spec.attack?.targets ?? 'ground') === 'ground';
        expect(row.tags!.some((t) => t.text === 'Ground only'), id).toBe(ground);
        seen++;
      }
      expect(fact(g.head!.sections[0]!, 'Second Race')).toBe('joins after Wave 15, free');
    }
    expect(seen).toBe(Object.keys(MAUL_TOWERS).length);
  });

  it('gives Strong and Weak against from the attack table, and names the shared slow and venom rules', () => {
    const row = (id: string): ReferenceRow => REF.towers({}).groups.flatMap((g) => g.rows).find((r) => r.id === `tower-${id}`)!;
    const tags = (id: string, title: string): string[] => row(id).sections.find((s) => s.title === title)!.tags!.map((t) => t.text);
    expect(tags('ballista', 'Strong against')).toEqual(['Light 150%']);
    expect(tags('ballista', 'Weak against')).toEqual(['Fortified 50%', 'Heavy 75%']);
    expect(tags('mortar', 'Weak against')).toEqual(['Light 50%', 'Air']);
    expect(tags('void_rune', 'Strong against')).toEqual(['Every armor 100%']);
    expect(tags('rot_bloom', 'Weak against')).toEqual(['Air']);
    expect(row('frost_spire').sections[0]!.lines).toContain('Slows don\'t stack: only the strongest slow on a creep counts');
    expect(row('chill_totem').sections[0]!.lines).toContain('Slows don\'t stack: only the strongest slow on a creep counts');
    expect(row('dart_tower').sections[0]!.lines!.join(' ')).toMatch(/venom from several towers stacks/);
    expect(row('blight_pod').sections[0]!.lines!.join(' ')).toMatch(/−4 armor/);
    expect(row('chain_rune').sections[0]!.lines!.join(' ')).toMatch(/Jumps to 4 more creeps/);
    expect(fact(row('mortar').sections[0]!, 'Splash')).toBe('80 full, 150 half');
  });

  it('shows only the Races picked', () => {
    expect(REF.towers({ race: 'rimeborn' }).groups.map((g) => g.id)).toEqual(['race-rimeborn']);
    expect(REF.towers({ race: 'ironclad+mirefolk' }).groups.map((g) => g.id)).toEqual(['race-ironclad', 'race-mirefolk']);
    expect(REF.towers({ race: 'nonsense' }).groups).toHaveLength(4);
  });
});

describe('in a Run', () => {
  it('opens on the Run\'s Race and Difficulty, with Difficulty fixed and the Race free to change', () => {
    const state = run('hard', 'mirefolk');
    const view = viewOf(state);
    expect(REF.defaults({ view })).toEqual({ race: 'mirefolk', difficulty: 'hard' });
    const fs = REF.filters(REF.defaults({ view }), { view });
    expect(fs.find((f) => f.id === 'difficulty')).toMatchObject({ value: 'hard', locked: 'Fixed for this Run' });
    const race = fs.find((f) => f.id === 'race')!;
    expect(race.value).toBe('mirefolk');
    expect(race.locked).toBeUndefined();
    // Once a second Race has joined, it opens on both, and offers both as one choice.
    state.mode.races.push('runecasters');
    expect(REF.defaults({ view })).toEqual({ race: 'mirefolk+runecasters', difficulty: 'hard' });
    const both = REF.filters(REF.defaults({ view }), { view }).find((f) => f.id === 'race')!;
    expect(both.value).toBe('mirefolk+runecasters');
    expect(both.choices.map((c) => c.label)).toContain('Mirefolk and Runecasters');
    expect(REF.towers(REF.defaults({ view })).groups.map((g) => g.id)).toEqual(['race-mirefolk', 'race-runecasters']);
    // From the main menu: every Race on Normal.
    expect(REF.defaults({})).toEqual({ race: 'all', difficulty: 'normal' });
  });

  it('marks the Wave being fought, or the one its Break counts down to, as Now', () => {
    const state = run();
    const view = viewOf(state);
    const values = REF.defaults({ view });
    expect(REF.current!(view, values)).toEqual({ now: 'wave-1', next: 'wave-2' });
    step(state, [{ type: 'maul.sendNow' }]);
    expect(maul.maulStatus(state).step).toBe('wave');
    expect(REF.current!(view, values)).toEqual({ now: 'wave-1', next: 'wave-2' });
    // A Break after Wave 1 is cleared counts down to Wave 2.
    state.mode.breakUntil = state.tick + 900;
    state.phase = 'build';
    expect(maul.maulStatus(state).step).toBe('break');
    expect(REF.current!(view, values)).toEqual({ now: 'wave-2', next: 'wave-3' });
    // The last Wave has no Next, and a Run that is over marks nothing.
    state.mode.breakUntil = -1;
    state.phase = 'wave';
    (state.wave as { number: number }).number = state.wave.total;
    expect(REF.current!(view, values)).toEqual({ now: 'wave-40', next: null });
    state.phase = 'lost';
    expect(REF.current!(view, values)).toEqual({ now: null, next: null });
  });
});

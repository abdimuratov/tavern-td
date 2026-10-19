import { describe, expect, it } from 'vitest';
import {
  FULL_SALE_UNTIL, INCOME_SECONDS, LIVE_CAP, LW_CREEPS, LW_SENDS, RIVAL_INCOME, SEND_LIST, START_GOLD, START_INCOME, START_LIVES,
  SUDDEN_STEAL,
} from '../src/content/linewars';
import { MAUL_CREEPS, MAUL_DAMAGE_TABLE, MAUL_TOWERS, RACES, SELL_SHARE, type AttackType, type RaceId } from '../src/content/maul';
import { advance, createRun, linewars, step, TICK_RATE, type Difficulty } from '../src/sim';
import type { RunView, ViewerSide } from '../src/ui/mode-ui';
import { LINEWARS_UI } from '../src/ui/modes/linewars';
import { MAUL_UI } from '../src/ui/modes/maul';
import { lineOf } from '../src/ui/modes/maul/reference';
import type { ReferenceRank, ReferenceRow, ReferenceSection, ReferenceValues } from '../src/ui/reference/types';

// Line Wars' Waves & Towers sheet: the ten Sends with Line Wars' own prices,
// unlocks, Income, Stock and HP, Best against from Maul's attack table, Now
// and Next by the Run's clock, the Viewer Side's Race locked in a Run, and
// Maul's towers with Line Wars' sells.

const REF = LINEWARS_UI.reference!;
type State = linewars.LwGameState;

function viewOf(state: State, side: ViewerSide = 0): RunView {
  return { state, side, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

/** Nobody plays either Side unless the test does: a quiet clock to step through. */
function run(o: { difficulty?: Difficulty; race?: RaceId; rivalRace?: RaceId; drivers?: readonly ['human' | 'ai', 'human' | 'ai'] } = {}): State {
  return createRun({
    mode: 'linewars', seed: 1, difficulty: o.difficulty ?? 'normal',
    options: { race: o.race ?? 'ironclad', rivalRace: o.rivalRace ?? 'mirefolk', drivers: [...(o.drivers ?? ['human', 'human'])] } as never,
  }) as State;
}

const order = (r: ReferenceRank): string[] => r.items.map((i) => i.text);
const fact = (s: ReferenceSection, key: string): string | undefined => s.facts?.find(([k]) => k === key)?.[1];
const plain = (s: string): number => Number(s.replace(/[^\d.]/g, ''));
const mmss = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const t1 = (race: RaceId, line: 'a' | 'b'): string => MAUL_TOWERS[lineOf(race, line)[0]!]!.name;

function sendRows(values: ReferenceValues = {}): readonly ReferenceRow[] {
  return REF.waves(values).groups[0]!.rows;
}

describe('the Sends tab', () => {
  it('is labelled Sends and lists the ten Sends in order with their price, unlock, Income and Stock', () => {
    expect(REF.wavesLabel).toBe('Sends');
    const rows = sendRows();
    expect(rows.map((r) => r.id)).toEqual(SEND_LIST.map((s) => `send-${s.id}`));
    rows.forEach((row, i) => {
      const send = SEND_LIST[i]!;
      const s = row.sections[0]!;
      expect(row.title).toBe(send.name);
      expect(row.lead).toBe(mmss(send.unlock));
      expect(fact(s, 'Unlocks')).toBe(mmss(send.unlock));
      expect(fact(s, 'Price')).toBe(`${send.price} gold`);
      expect(fact(s, 'Income')).toMatch(new RegExp(`^\\+${send.income}, `));
      expect(plain(fact(s, 'Income')!.split(', ')[1]!)).toBeCloseTo((send.income / send.price) * 100, 1);
      expect(fact(s, 'Stock')).toBe(`1 at unlock, up to ${send.cap}`);
      expect(fact(s, 'Restock')).toBe(send.cap > 1 ? `+1 every ${send.restock} s` : `${send.restock} s after each buy`);
      expect(fact(s, 'Creeps')).toBe(String(send.count));
      expect(fact(s, 'Live cap')).toBe(`counts ${send.count} of your ${LIVE_CAP}`);
      expect(fact(s, 'Key')).toBe(send.key);
      // Its payback is the Income ticks its price takes.
      const [m, sec] = fact(s, 'Pays back')!.replace('in ', '').split(':').map(Number);
      expect(m! * 60 + sec!).toBe(Math.round((send.price / send.income) * INCOME_SECONDS));
    });
  });

  it('gives each Send\'s creeps their HP, armor, bounty and steal, and how Sudden Death toughens them', () => {
    const rows = sendRows();
    rows.forEach((row, i) => {
      const send = SEND_LIST[i]!;
      const c = LW_CREEPS[send.creep]!;
      const s = row.sections[1]!;
      expect(s.title).toBe(`${send.count} × ${c.name}`);
      expect(fact(s, 'HP')).toBe(send.hp.toLocaleString('en-US'));
      expect(fact(s, 'Armor')).toMatch(new RegExp(` ${c.armor}$`));
      expect(fact(s, 'Speed')).toBe(String(MAUL_CREEPS[send.creep]!.speed));
      expect(fact(s, 'Bounty')).toBe(`${send.bounty} gold each, to the defender`);
      const lives = send.steals === 1 ? 'life' : 'lives';
      expect(fact(s, 'A Leak steals')).toBe(`${send.steals} ${lives}, ${send.steals * SUDDEN_STEAL} in Sudden Death`);
      const sudden = linewars.suddenTick();
      const [at12, atEnd] = fact(s, 'Sudden Death HP')!.split(', ').map((x) => plain(x.split(' at ')[0]!));
      expect(at12).toBe(linewars.sendHpAt(send, sudden + 60 * TICK_RATE));
      expect(atEnd).toBe(linewars.sendHpAt(send, linewars.lastTick()));
      expect(row.tags!.map((t) => t.text).includes('Air')).toBe(c.flying);
    });
  });

  it('matches a real Run: a Send bought at 12:00 enters with the HP shown', () => {
    const state = run();
    const at = linewars.suddenTick() + 60 * TICK_RATE;
    advance(state, at);
    expect(state.tick).toBe(at);
    const events = step(state, [{ type: 'lw.send', side: 0, send: 'brawler' }]);
    expect(events.some((e) => e.type === 'rejected')).toBe(false);
    const creep = state.creeps.find((c) => c.spec === LW_SENDS.brawler.creep)!;
    const row = sendRows().find((r) => r.id === 'send-brawler')!;
    expect(creep.maxHp).toBe(plain(fact(row.sections[1]!, 'Sudden Death HP')!.split(' at ')[0]!));
    // Bought before Sudden Death, it enters with the Send's own HP.
    const early = run();
    advance(early, LW_SENDS.brawler.unlock * TICK_RATE + 1);
    step(early, [{ type: 'lw.send', side: 0, send: 'brawler' }]);
    expect(early.creeps[0]!.maxHp).toBe(plain(fact(row.sections[1]!, 'HP')!));
  });

  it('shows the start, the Income tick, the cap, Sudden Death and the Rival\'s income factor as chips', () => {
    const chips = REF.waves({}).intro!.map((t) => t.text);
    expect(chips).toEqual([
      `${START_GOLD} gold`, `Income ${START_INCOME} every ${INCOME_SECONDS} s`, `${START_LIVES} lives`, `Live cap ${LIVE_CAP}`,
      'Sudden Death 11:00–15:50', `Rival ×${Math.min(...Object.values(RIVAL_INCOME))}–${Math.max(...Object.values(RIVAL_INCOME))}`,
    ]);
    // In a Run against the AI on Hard, the Rival's factor is the Run's; Versus has none.
    const hard = viewOf(run({ difficulty: 'hard', drivers: ['human', 'ai'] }));
    expect(REF.waves(REF.defaults({ view: hard })).intro!.at(-1)!.text).toBe(`Rival ×${RIVAL_INCOME.hard}`);
    const versus = viewOf(run());
    expect(REF.waves(REF.defaults({ view: versus })).intro!.some((t) => t.text.startsWith('Rival'))).toBe(false);
  });
});

describe('Best against', () => {
  it('reads every share from Maul\'s attack table, and leaves out Siege and the ground lines for Harpies', () => {
    for (const row of sendRows()) {
      const send = LW_SENDS[row.id.replace('send-', '') as keyof typeof LW_SENDS];
      const armor = LW_CREEPS[send.creep]!.armorType;
      for (const item of row.sections[1]!.ranks![0]!.items) {
        const type = item.text.toLowerCase();
        expect(item.value, `${send.id} ${type}`).toBe(`${(type === 'poison' ? 1 : MAUL_DAMAGE_TABLE[type as AttackType][armor]) * 100}%`);
      }
    }
    const harpies = sendRows().find((r) => r.id === 'send-harpies')!.sections[1]!.ranks!;
    expect(order(harpies[0]!)).not.toContain('Siege');
    expect(harpies[0]!.note).toBe('Can\'t hit air: Siege');
    expect(harpies[1]!.note).toBe('Can\'t hit air: Mortar, Spore Pod');
    // A boss Send: poison first, slows last.
    const mammoth = sendRows().find((r) => r.id === 'send-mammoth')!.sections[1]!.ranks!;
    expect(order(mammoth[0]!)[0]).toBe('Poison');
    expect(order(mammoth[1]!).slice(-2).sort()).toEqual([t1('rimeborn', 'a'), t1('rimeborn', 'b')].sort());
  });

  it('ranks only your Race\'s lines once one is picked', () => {
    const golem = sendRows({ race: 'runecasters' }).find((r) => r.id === 'send-ice_golem')!.sections[1]!.ranks![1]!;
    expect(order(golem).sort()).toEqual([t1('runecasters', 'a'), t1('runecasters', 'b')].sort());
    expect(golem.items.find((i) => i.text === t1('runecasters', 'a'))!.why).toEqual(['Void Rune hits it as Chaos, 100%']);
  });
});

describe('the Towers tab', () => {
  it('lists Maul\'s four Races and 36 towers with Line Wars\' sells', () => {
    const tab = REF.towers({});
    expect(tab.groups.map((g) => g.id)).toEqual(RACES.map((r) => `race-${r}`));
    const rows = tab.groups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(Object.keys(MAUL_TOWERS).length);
    for (const row of rows) {
      const m = MAUL_TOWERS[row.id.replace('tower-', '')]!.maul;
      const s = row.sections[0]!;
      expect(fact(s, 'Sells for')).toBe(`${Math.floor(m.total * SELL_SHARE)} gold (75%) · ${m.total} until ${mmss(FULL_SALE_UNTIL)}`);
      expect(fact(s, m.tier <= 1 ? 'Build' : 'Upgrade')).toBe(`${m.tier <= 1 ? m.total : m.price} gold`);
    }
    // Maul's rows say the Break and the second Race instead.
    const maulRow = MAUL_UI.reference!.towers({}).groups[0]!.rows[0]!;
    expect(fact(maulRow.sections[0]!, 'Sells for')).toMatch(/this Break$/);
    expect(fact(tab.groups[0]!.head!.sections[0]!, 'Race')).toBe('one per Side, the whole Run');
    expect(rows[0]!.sections[0]!.lines).toContain('One Race per Side: a Wall becomes only its own Race\'s Tier 1 towers');
  });

  it('names the Sends\' creeps of each armor under Strong and Weak against', () => {
    const tower = (id: string): ReferenceRow => REF.towers({}).groups.flatMap((g) => g.rows).find((r) => r.id === `tower-${id}`)!;
    const about = (id: string, title: string): (string | undefined)[] =>
      tower(id).sections.find((s) => s.title === title)!.tags!.map((t) => t.about);
    const named = (armor: string): string => Object.values(LW_CREEPS).filter((c) => c.armorType === armor).map((c) => c.name).join(', ');
    expect(about('ballista', 'Strong against')).toEqual([named('light')]);
    expect(about('bombard', 'Strong against')).toEqual([named('fortified')]);
    expect(about('mortar', 'Weak against')).toEqual([named('light'), Object.values(LW_CREEPS).filter((c) => c.flying).map((c) => c.name).join(', ')]);
  });
});

describe('in a Run', () => {
  it('locks the Race to the Viewer Side\'s, and marks You and the Rival on the Towers tab', () => {
    const state = run({ race: 'rimeborn', rivalRace: 'runecasters' });
    for (const [side, mine, theirs] of [[0, 'rimeborn', 'runecasters'], [1, 'runecasters', 'rimeborn']] as const) {
      const view = viewOf(state, side);
      const values = REF.defaults({ view });
      const race = REF.filters(values, { view }).find((f) => f.id === 'race')!;
      expect(race).toMatchObject({ value: mine, locked: 'Your Race for this Run', tabs: ['waves'] });
      const lines = sendRows(values)[0]!.sections[1]!.ranks![1]!;
      expect(order(lines).sort()).toEqual([t1(mine, 'a'), t1(mine, 'b')].sort());
      const heads = REF.towers(values).groups.map((g) => [g.id, g.head!.tags!.map((t) => t.text)]);
      expect(heads).toEqual(RACES.map((r) => [`race-${r}`, [...(r === mine ? ['You'] : []), ...(r === theirs ? ['Rival'] : [])]]));
    }
    // From the main menu nothing is locked, and every Race counts.
    expect(REF.defaults({})).toEqual({ race: 'all' });
    expect(REF.filters({ race: 'all' }, {})[0]!.locked).toBeUndefined();
  });

  it('marks the latest Send to unlock as Now and the next to unlock as Next, by the Run\'s clock', () => {
    const state = run();
    const view = viewOf(state);
    const values = REF.defaults({ view });
    const now = (): ReturnType<NonNullable<typeof REF.current>> => REF.current!(view, values);
    expect(now()).toEqual({ now: null, next: 'send-snowlings' });
    const to = (seconds: number): void => void advance(state, seconds * TICK_RATE + 1 - state.tick);
    to(LW_SENDS.snowlings.unlock);
    expect(now()).toEqual({ now: 'send-snowlings', next: 'send-brawler' });
    to(LW_SENDS.troll.unlock + 5);
    expect(now()).toEqual({ now: 'send-troll', next: 'send-hollow' });
    to(LW_SENDS.mammoth.unlock);
    expect(now()).toEqual({ now: 'send-mammoth', next: null });
    // A Versus Guest's Stock unlocks on the same clock.
    expect(REF.current!(viewOf(state, 1), values)).toEqual({ now: 'send-mammoth', next: null });
  });
});

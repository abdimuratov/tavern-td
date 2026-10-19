import {
  FULL_SALE_UNTIL, INCOME_SECONDS, LIVE_CAP, LW_CREEPS, RIVAL_INCOME, SEND_LIST, START_GOLD, START_INCOME, START_LIVES,
  SUDDEN_HP_PER_MINUTE, type LwSendSpec,
} from '../../../content/linewars';
import { RACES, SELL_SHARE, type RaceId } from '../../../content/maul';
import { DIFFICULTIES, linewars, maul, TICK_RATE, type Difficulty } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import { clock, num } from '../../format';
import type {
  ModeReference, ReferenceContext, ReferenceFilter, ReferenceRow, ReferenceSection, ReferenceTab, ReferenceTag, ReferenceValues,
} from '../../reference/types';
import {
  ALL_RACES, bestAgainst, creepColor, creepFacts, creepLines, creepTagList, DPS_NOTE, pct, raceChoices, raceGroups, racesOf,
  type TowerRules,
} from '../maul/reference';
import { raceName } from '../maul/text';
import { factorText, suddenRule } from './text';

// Line Wars' Waves & Towers sheet (ModeUi.reference): the ten Sends, labelled
// "Sends", each with its price, Income, Stock, creeps and what a Leak steals,
// and Maul's four Races with Line Wars' own sells. Best against and the tower
// rows are Maul's (src/ui/modes/maul/reference.ts); every number here is Line
// Wars' own, from its content tables and the sim's queries.

const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;
/** m:ss of a Run tick. */
const at = (tick: number): string => clock(Math.floor(tick / TICK_RATE));
const isRace = (v: string | undefined): v is RaceId => (RACES as readonly string[]).includes(v ?? '');
const isDifficulty = (v: string | undefined): v is Difficulty => (DIFFICULTIES as readonly string[]).includes(v ?? '');

const SUDDEN = linewars.suddenTick();
const LAST = linewars.lastTick();
const MINUTE = 60 * TICK_RATE;

// --- The filter --------------------------------------------------------------------

/**
 * In a Run the values also carry the Rival's Race (`rival`), its Difficulty
 * (`difficulty`) and whether it is Versus (`versus`), for the chips and the
 * Towers tab's You and Rival.
 */
function defaults(ctx: ReferenceContext): ReferenceValues {
  if (ctx.view) {
    const ms = linewars.lwState(ctx.view.state);
    const me = ms.sides[ctx.view.side];
    const them = ms.sides[linewars.other(ctx.view.side)];
    return {
      race: me.race, rival: them.race, difficulty: ctx.view.state.difficulty,
      versus: me.driver === 'human' && them.driver === 'human' ? '1' : '0',
    };
  }
  return { race: ctx.from?.['race'] ?? ALL_RACES };
}

function filters(values: ReferenceValues, ctx: ReferenceContext): ReferenceFilter[] {
  const races = racesOf(values['race']);
  const value = races.length === 1 ? races[0]! : ALL_RACES;
  return [{
    id: 'race', label: 'Your Race', kind: 'select', value, tabs: ['waves'], choices: raceChoices(),
    ...(ctx.view ? { locked: 'Your Race for this Run' } : {}),
  }];
}

// --- The Sends tab -----------------------------------------------------------------

/** The Rival's income factor: this Run's, or every Difficulty's; Versus has none. */
function rivalTag(values: ReferenceValues): ReferenceTag | null {
  if (values['versus'] === '1') return null;
  const d = values['difficulty'];
  if (isDifficulty(d)) return { text: `Rival ${factorText(RIVAL_INCOME[d])}`, about: `On ${DIFFICULTY_NAME[d]} the Rival is paid its Income ${factorText(RIVAL_INCOME[d])}, rounded down` };
  const factors = DIFFICULTIES.map((x) => RIVAL_INCOME[x]);
  return {
    text: `Rival ${factorText(Math.min(...factors))}–${factorText(Math.max(...factors)).slice(1)}`,
    about: `The Rival is paid its Income times its Difficulty's factor: ${DIFFICULTIES.map((x) => `${DIFFICULTY_NAME[x]} ${factorText(RIVAL_INCOME[x])}`).join(' · ')}`,
  };
}

/** Each creep of `send` in full: its numbers now and in Sudden Death, what a Leak steals, and Best against. */
function creepSection(send: LwSendSpec, races: readonly RaceId[]): ReferenceSection {
  const spec = LW_CREEPS[send.creep]!;
  const steal = linewars.leakStealAt(send, 0);
  const sudden = linewars.leakStealAt(send, SUDDEN);
  const best = bestAgainst(spec, races);
  return {
    title: `${num(send.count)} × ${spec.name}`,
    swatch: creepColor(send.creep),
    tags: creepTagList(spec),
    facts: [
      ...creepFacts(spec, linewars.sendHpAt(send, 0)),
      ['Bounty', `${num(send.bounty)} gold each, to the defender`],
      ['A Leak steals', `${plural(steal, 'life', 'lives')}, ${num(sudden)} in Sudden Death`],
      ['Sudden Death HP', `${num(linewars.sendHpAt(send, SUDDEN + MINUTE))} at ${at(SUDDEN + MINUTE)}, ${num(linewars.sendHpAt(send, LAST))} at ${at(LAST)}`],
    ],
    lines: [
      ...creepLines(spec),
      `Bought in Sudden Death: +${pct(SUDDEN_HP_PER_MINUTE)} HP for each minute since ${at(SUDDEN)}, and no Income`,
    ],
    ranks: [best.attacks, best.lines],
  };
}

function sendRow(send: LwSendSpec, races: readonly RaceId[]): ReferenceRow {
  const spec = LW_CREEPS[send.creep]!;
  const income = linewars.sendIncomeAt(send, 0);
  const facts: [string, string][] = [
    ['Unlocks', at(linewars.unlockTick(send))],
    ['Price', `${num(send.price)} gold`],
    ['Income', `+${num(income)}, ${pct(income / send.price)} of its price`],
    ['Pays back', `in ${clock((send.price / income) * INCOME_SECONDS)}`],
    ['Stock', `1 at unlock, up to ${num(send.cap)}`],
    ['Restock', send.cap > 1 ? `+1 every ${num(send.restock)} s` : `${num(send.restock)} s after each buy`],
    ['Creeps', num(send.count)],
    ['Live cap', `counts ${num(send.count)} of your ${num(LIVE_CAP)}`],
    ['Key', send.key],
  ];
  return {
    id: `send-${send.id}`,
    lead: at(linewars.unlockTick(send)),
    title: send.name,
    summary: `${num(send.price)} gold · +${num(income)}`,
    tags: creepTagList(spec),
    sections: [{ facts }, creepSection(send, races)],
  };
}

function waves(values: ReferenceValues): ReferenceTab {
  const races = racesOf(values['race']);
  const rival = rivalTag(values);
  const packs = SEND_LIST.filter((s) => s.count > 1).map((s) => `a ${s.name} Send counts ${num(s.count)}`);
  return {
    intro: [
      { text: `${num(START_GOLD)} gold` },
      { text: `Income ${num(START_INCOME)} every ${num(INCOME_SECONDS)} s`, about: `The first Income tick is at ${clock(INCOME_SECONDS)}; each Send adds its Income at once and for good` },
      { text: plural(START_LIVES, 'life', 'lives') },
      { text: `Live cap ${num(LIVE_CAP)}`, about: `At most ${num(LIVE_CAP)} of your creeps alive in the Rival's Field at once; ${packs.join(', ')}` },
      { text: `Sudden Death ${at(SUDDEN)}–${at(LAST)}`, tone: 'bad', about: suddenRule() },
      ...(rival ? [rival] : []),
    ],
    groups: [{ id: 'sends', rows: SEND_LIST.map((s) => sendRow(s, races)) }],
  };
}

// --- The Towers tab ----------------------------------------------------------------

/** Line Wars' tower rules: Maul's 75% back on a sale, all of it until 0:20, and one Race per Side. */
function towerRules(values: ReferenceValues): TowerRules {
  const you = values['rival'] !== undefined && isRace(values['race']) ? values['race'] : null;
  const rival = isRace(values['rival']) ? values['rival'] : null;
  return {
    creeps: LW_CREEPS,
    sells: (total) => `${num(maul.saleValue(total, 0))} gold (${pct(SELL_SHARE)}) · ${num(maul.saleValue(total, total))} until ${clock(FULL_SALE_UNTIL)}`,
    wallLines: ['One Race per Side: a Wall becomes only its own Race\'s Tier 1 towers'],
    raceFacts: () => [['Race', 'one per Side, the whole Run']],
    raceTags: (race) => [
      ...(race === you ? [{ text: 'You', tone: 'good' as const }] : []),
      ...(race === rival ? [{ text: 'Rival', tone: 'bad' as const, about: `The Rival builds ${raceName(race)}` }] : []),
    ],
  };
}

function towers(values: ReferenceValues): ReferenceTab {
  return {
    intro: [
      { text: 'One Race per Side' },
      { text: `Sells ${pct(SELL_SHARE)}`, about: `Until ${clock(FULL_SALE_UNTIL)}, before any Send can unlock, a sale returns everything` },
      { text: `All back until ${clock(FULL_SALE_UNTIL)}` },
      { text: 'Slows don\'t stack', about: 'Every slow shares one key: only the strongest on a creep counts' },
    ],
    note: DPS_NOTE,
    groups: raceGroups(RACES, towerRules(values)),
  };
}

export const LINEWARS_REFERENCE: ModeReference = {
  wavesLabel: 'Sends',
  defaults,
  filters,
  waves,
  towers,
  /** The latest Send to unlock is Now, and the next to unlock is Next, by the Viewer Side's Stock. */
  current(view) {
    const ms = linewars.lwState(view.state);
    if (ms.result !== 'playing') return { now: null, next: null };
    const side = linewars.sideOf(view.state, view.side);
    const byUnlock = [...SEND_LIST].sort((a, b) => a.unlock - b.unlock);
    const open = byUnlock.filter((s) => !linewars.sendLocked(side, s.id));
    const locked = byUnlock.filter((s) => linewars.sendLocked(side, s.id));
    return { now: open.length > 0 ? `send-${open.at(-1)!.id}` : null, next: locked[0] ? `send-${locked[0].id}` : null };
  },
};

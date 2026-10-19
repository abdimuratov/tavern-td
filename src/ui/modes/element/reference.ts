import {
  BOSS_HP_GROWTH, BOSS_TRAITS, CREEPS_PER_WAVE, ELEMENTS, ELEMENT_CREEPS, ELEMENT_TOWERS, ESSENCE_AFTER, EXPRESS_LEVEL_GATES,
  FREE_ELEMENTS, FULL_WAVES, HASTE_SPEED, INTEREST_PERIOD, INTEREST_RATE, INTEREST_STOPS_AFTER, LUMBER_AFTER, MAX_ELEMENT_LEVEL,
  MIN_SPEED, SELL, START, START_LIVES, TOWER_IDS, bossId, damageMultiplier, elementName, elementalId,
  type DamageElement, type Element, type ElementTowerSpec, type RunLength, type TowerKind, type Trait,
} from '../../../content/element';
import { DIFFICULTIES, element, waveGroupNumbers, type Difficulty, type WaveGroup, type WaveSpec } from '../../../sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../../catalog';
import { num } from '../../format';
import { armorProfile, rankCounters, type CounterCandidate, type CounterEdge, type CounterTarget } from '../../reference/counters';
import type {
  ModeReference, ReferenceContext, ReferenceFilter, ReferenceGroup, ReferenceRank, ReferenceRankItem, ReferenceRow, ReferenceSection,
  ReferenceTab, ReferenceTag, ReferenceValues,
} from '../../reference/types';
import { ELEMENT_COLOR } from './look';
import { abilityLines, damageName, pct, rate, TRAIT_ABOUT, TRAIT_NAME } from './text';

// Element's Waves & Towers sheet (ModeUi.reference): Full's 55 Waves and its
// endless boss Waves, or Express's 30, with the Elementals; every Wave's
// creeps, Trait, HP, bounty and Best against by the six-Element cycle and by
// the towers you could hold by then; and all 144 towers by kind, with their
// prices, levels and Element requirements. Every number comes from the
// content tables and the sim's queries; the words are text.ts's.

const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;
const both = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);
const either = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)!}`);
const secs = (s: number): string => `${num(s)} s`;
const gold = (n: number): string => `${num(n)} gold`;

/** Every damage kind: the six Elements, then Composite. */
const DAMAGES: readonly DamageElement[] = [...ELEMENTS, 'composite'];

/** The cycle's share: 200% to the next Element, 50% to the one before, 90% from an Element into Composite, Composite 100% to all. */
export function share(damage: string, armor: string): number {
  return damageMultiplier(damage as DamageElement, armor as DamageElement);
}

const spec = (id: string): ElementTowerSpec => ELEMENT_TOWERS[id]!;
const LENGTHS: readonly RunLength[] = ['full', 'express'];
const LENGTH_NAME: Readonly<Record<RunLength, string>> = { full: 'Full', express: 'Express' };

// --- What a Run holds by a Wave -----------------------------------------------------

/** Lumber a Run can have spent by the time Wave `wave` comes: the start's, plus one after each Lumber Wave cleared before it. */
export function lumberBy(length: RunLength, wave: number): number {
  return START[length].lumber + LUMBER_AFTER[length].filter((w) => w < wave).length;
}

/** The highest Element level a Run can hold by Wave `wave`: Express opens levels 2 and 3 after its gates. */
export function levelCapBy(length: RunLength, wave: number): number {
  if (length !== 'express') return MAX_ELEMENT_LEVEL;
  let cap = 1;
  for (const [level, gate] of Object.entries(EXPRESS_LEVEL_GATES)) if (wave - 1 >= gate) cap = Math.max(cap, Number(level));
  return cap;
}

/** Pure Essence handed out before Wave `wave`. */
function freeEssenceBy(length: RunLength, wave: number): number {
  return ESSENCE_AFTER[length].filter((w) => w < wave).length;
}

/** The towers each tower is upgraded from. */
const FROM: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const id of TOWER_IDS) for (const to of spec(id).element.upgrades) m.set(to, [...(m.get(to) ?? []), id]);
  return m;
})();

type Levels = Readonly<Partial<Record<Element, number>>>;

const levelSum = (l: Levels): number => ELEMENTS.reduce((sum, e) => sum + (l[e] ?? 0), 0);

/**
 * The Element levels a Run holds to stand this tower: its own needs, raised to
 * the needs of the cheapest tower it is upgraded from (a Pure tower lists none
 * of its own, but comes from a level-3 single). The Periodic tower needs all six at 1.
 */
export function neededLevels(id: string): Levels {
  const needs = element.towerNeeds(spec(id).element);
  const own: Partial<Record<Element, number>> = Object.fromEntries(needs.levels);
  if (needs.allSix) for (const e of ELEMENTS) own[e] = Math.max(own[e] ?? 0, 1);
  const from = (FROM.get(id) ?? []).map(neededLevels).sort((a, b) => levelSum(a) - levelSum(b))[0];
  if (from) for (const e of ELEMENTS) if ((from[e] ?? 0) > (own[e] ?? 0)) own[e] = from[e]!;
  return own;
}

/** Whether a Run can stand tower `id` by Wave `wave`: its levels within the Lumber and the level cap, and a Pure Essence when it costs one. */
export function holdable(id: string, length: RunLength, wave: number): boolean {
  const needs = neededLevels(id);
  const cap = levelCapBy(length, wave);
  if (ELEMENTS.some((e) => (needs[e] ?? 0) > cap)) return false;
  // Without a free one, a Pure Essence takes a Lumber of its own.
  const essence = spec(id).element.essence > 0 && freeEssenceBy(length, wave) === 0 ? 1 : 0;
  return levelSum(needs) + essence <= lumberBy(length, wave);
}

/** "Fire 1 and Earth 1", "all six Elements at 1", or "nothing". */
function needsText(id: string): string {
  const info = spec(id).element;
  if (element.towerNeeds(info).allSix) return 'all six Elements at 1';
  const needs = neededLevels(id);
  const list = ELEMENTS.filter((e) => (needs[e] ?? 0) > 0).map((e) => `${elementName(e)} ${needs[e]!}`);
  return list.length > 0 ? both(list) : 'nothing';
}

// --- Tower lines --------------------------------------------------------------------

/** The order lines come in when the cycle ties them: the kinds that hit hardest first. */
const KIND_ORDER: readonly TowerKind[] = ['triple', 'dual', 'single', 'pure', 'elementalBasic', 'basic', 'periodic'];

type Effect = { readonly kind: string };
const effectKinds = (s: ElementTowerSpec): string[] => [...(s.attack?.effects ?? []).map((e) => (e as Effect).kind), ...(s.element.ability ? [s.element.ability.kind] : [])];

/** Hits several creeps at once: a splash, a burst, a pulse, a chain or a cloud. */
const AREA_KINDS: ReadonlySet<string> = new Set([
  'element.flame', 'element.gunpowder', 'element.flooding', 'element.nova', 'element.poison', 'element.erosion', 'element.jinx',
  'element.roots', 'element.electricity', 'element.quake', 'pulse', 'tornado',
]);
/** Slows or stuns. */
const HOLD_KINDS: ReadonlySet<string> = new Set(['element.muck', 'element.nova', 'element.roots', 'element.ice', 'tornado']);

const hitsMany = (s: ElementTowerSpec): boolean => s.element.splash !== null || effectKinds(s).some((k) => AREA_KINDS.has(k));
const holds = (s: ElementTowerSpec): boolean => effectKinds(s).some((k) => HOLD_KINDS.has(k));

interface LineCandidate extends CounterCandidate {
  /** Its towers, lowest level first. */
  readonly towers: readonly string[];
  readonly kind: TowerKind;
  readonly many: boolean;
  readonly holds: boolean;
}

/** Every tower line: Arrow, Cannon and each elemental one; each single with its Pure tower; each dual and triple; the Periodic tower. */
const LINES: readonly LineCandidate[] = (() => {
  const keyOf = (id: string): string => {
    const info = spec(id).element;
    if (info.kind === 'elementalBasic') return `${info.family}-${info.elements[0]!}`;
    return info.family;
  };
  const groups = new Map<string, string[]>();
  for (const id of TOWER_IDS) groups.set(keyOf(id), [...(groups.get(keyOf(id)) ?? []), id]);
  const lines = [...groups.entries()].map(([key, ids]): LineCandidate => {
    const towers = [...ids].sort((a, b) => spec(a).element.level - spec(b).element.level);
    const first = spec(towers[0]!);
    return { id: key, damage: first.element.damage, hitsAir: true, towers, kind: first.element.kind, many: hitsMany(first), holds: holds(first) };
  });
  return lines.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
})();

/** The rules beyond the cycle, for a line against a Wave's creeps; they only order lines the cycle ties. */
function lineEdges(c: LineCandidate, trait: Trait | null, count: number, full: number): CounterEdge[] {
  const edges: CounterEdge[] = [];
  if (c.many && count >= full) edges.push({ edge: 1, why: `hits several of its ${num(count)} at once` });
  if (c.holds && trait === 'fast') edges.push({ edge: 1, why: 'its slows hold it back between dashes' });
  if (c.holds && trait === 'mechanical') edges.push({ edge: -1, why: 'its shield purges slows and stuns' });
  return edges;
}

const withWhy = (item: Omit<ReferenceRankItem, 'why'>, why: readonly string[]): ReferenceRankItem =>
  (why.length > 0 ? { ...item, why } : item);

/** The six Elements and Composite, by the cycle against `armor`. */
export function elementRank(armor: DamageElement): ReferenceRank {
  const target: CounterTarget = { armor, air: false };
  const candidates = DAMAGES.map((d) => ({ id: d, damage: d, hitsAir: true }));
  const ranked = rankCounters(target, candidates, { share });
  return { label: 'Best against', items: ranked.ranked.map((r) => ({ text: damageName(r.candidate.damage as DamageElement), value: pct(r.share), rank: r.rank })) };
}

/** The best tower of `line` a Run can stand by Wave `wave`, or null when it can't stand any yet. */
function bestHeld(line: LineCandidate, length: RunLength, wave: number): string | null {
  const held = line.towers.filter((id) => holdable(id, length, wave));
  return held.at(-1) ?? null;
}

/**
 * The tower lines that deal the cycle's best share to these creeps and that a
 * Run can stand by Wave `wave`, each named by its best tower by then, ordered
 * by the Trait rules. The Periodic tower hits as each Element in turn.
 */
export function towerRank(armor: DamageElement, trait: Trait | null, count: number, length: RunLength, wave: number): ReferenceRank {
  const target: CounterTarget = { armor, air: false };
  const lines = LINES.filter((l) => l.kind !== 'periodic');
  const top = Math.max(...lines.map((l) => share(l.damage, armor)));
  const best = lines.filter((l) => share(l.damage, armor) === top);
  const held = best.filter((l) => bestHeld(l, length, wave) !== null);
  const later = best.filter((l) => bestHeld(l, length, wave) === null).map((l) => spec(l.towers[0]!).name);
  const ranked = rankCounters(target, held, { share, edges: (c) => lineEdges(c, trait, count, CREEPS_PER_WAVE) });
  const notes: string[] = [];
  if (later.length > 0) notes.push(`Not by Wave ${num(wave)}: ${later.join(', ')}`);
  if (armor === 'composite') notes.push(`Every Element deals ${pct(share(ELEMENTS[0], 'composite'))} to it`);
  return {
    label: 'Towers',
    items: ranked.ranked.map((r) => withWhy({ text: spec(bestHeld(r.candidate, length, wave)!).name, value: pct(r.share), rank: r.rank }, r.why)),
    ...(notes.length > 0 ? { note: notes.join(' · ') } : {}),
  };
}

// --- Creeps and Waves ---------------------------------------------------------------

const ELEMENT_TAG = (e: DamageElement): ReferenceTag => ({ text: damageName(e), tone: 'trait', about: e === 'composite' ? 'No Element' : `${damageName(e)} creep` });

function traitTag(t: Trait): ReferenceTag {
  return { text: TRAIT_NAME[t], tone: 'trait', about: TRAIT_ABOUT[t] };
}

/** A Trait's rule, with the content's numbers where it has them. */
function traitLine(t: Trait): string {
  if (t === 'fast') return `${TRAIT_NAME[t]}: ${TRAIT_ABOUT[t]}, at ${num(HASTE_SPEED)} speed, ignoring slows meanwhile`;
  return `${TRAIT_NAME[t]}: ${TRAIT_ABOUT[t]}`;
}

/** Wave `n`'s spec and its creeps' numbers at the Difficulty, as the sim starts it. */
function groupsOf(length: RunLength, d: Difficulty, n: number): { w: WaveSpec; g: WaveGroup; hp: number; speed: number; bounty: number }[] {
  const w = element.waveSpecFor(length, d, n - 1);
  if (!w) return [];
  return w.groups.map((g) => ({ w, g, ...waveGroupNumbers(element.ELEMENT_RULES, w, g, d) }));
}

function waveRow(length: RunLength, d: Difficulty, n: number): ReferenceRow | null {
  const p = element.previewWave(length, d, n - 1);
  const groups = groupsOf(length, d, n);
  const first = groups[0];
  if (!p || p.boss || !first) return null;
  const creep = ELEMENT_CREEPS[first.g.creep]!;
  const trait = creep.trait;
  const lumber = LUMBER_AFTER[length].includes(n);
  const essence = ESSENCE_AFTER[length].includes(n);
  const tags: ReferenceTag[] = [ELEMENT_TAG(p.element), ...(trait ? [traitTag(trait)] : [])];
  if (lumber) tags.push({ text: 'Lumber', tone: 'good', about: 'Clearing it brings a Lumber, at the start of the next Break' });
  if (essence) tags.push({ text: 'Pure Essence', tone: 'good', about: 'Clearing it brings a Pure Essence' });
  const clearing = [lumber ? 'a Lumber' : '', essence ? 'a Pure Essence' : ''].filter(Boolean);
  const wave: ReferenceSection = {
    facts: [
      ['Creeps', `${num(p.count)}, ${secs(first.g.interval)} apart`],
      ['Break before', secs(p.breakBefore)],
      ['Bounty pool', gold(p.count * first.bounty)],
      ...(clearing.length > 0 ? [['Clearing it', `brings ${both(clearing)}`] as [string, string]] : []),
      ['Lumber so far', `${num(lumberBy(length, n))}${length === 'express' ? `, levels up to ${levelCapBy(length, n)}` : ''}`],
    ],
  };
  const lives = element.leakLivesFor(creep, false);
  const section: ReferenceSection = {
    title: `${num(p.count)} × ${p.name}`,
    swatch: ELEMENT_COLOR[p.element],
    tags: [ELEMENT_TAG(p.element), ...(trait ? [traitTag(trait)] : [])],
    facts: [
      ['HP', num(first.hp)],
      ['Element', damageName(p.element)],
      ['Speed', num(first.speed)],
      ['Slowed to', `${num(creep.minSpeed ?? MIN_SPEED)} at least`],
      ['Bounty', `${gold(first.bounty)} each`],
      ['Leak', `${plural(lives, 'life', 'lives')}; it walks the Lane again`],
    ],
    lines: trait ? [traitLine(trait)] : [],
    ranks: [elementRank(p.element), towerRank(p.element, trait, p.count, length, n)],
  };
  return {
    id: `wave-${n}`,
    lead: String(n),
    title: `${num(p.count)} ${p.name}`,
    summary: `${num(first.hp)} HP`,
    swatch: ELEMENT_COLOR[p.element],
    tags,
    sections: [wave, section],
  };
}

/** Full's endless boss Waves, after its 55: one row for all of them. */
function bossRow(d: Difficulty): ReferenceRow | null {
  const n = FULL_WAVES + 1;
  const p = element.previewWave('full', d, n - 1);
  const groups = groupsOf('full', d, n);
  if (!p || !p.boss || groups.length === 0) return null;
  const boss = ELEMENT_CREEPS[bossId(BOSS_TRAITS[0]!)]!;
  const bulky = groups.filter((x) => ELEMENT_CREEPS[x.g.creep]?.trait === 'bulky').length;
  const nonBulky = groups.find((x) => ELEMENT_CREEPS[x.g.creep]?.trait !== 'bulky')!;
  const lives = element.leakLivesFor(ELEMENT_CREEPS[bossId('heal')], true);
  const bulkyLives = element.leakLivesFor(ELEMENT_CREEPS[bossId('bulky')], true);
  return {
    id: 'boss',
    lead: `${n}+`,
    title: `Boss Waves: ${num(p.count)} ${p.name}`,
    summary: `${num(nonBulky.hp)} HP`,
    swatch: ELEMENT_COLOR.composite,
    tags: [{ text: 'Endless', tone: 'boss', about: 'Boss Waves go on until the Run ends; they only add score' }, ELEMENT_TAG('composite')],
    sections: [
      {
        facts: [
          ['Creeps', `${num(p.count)}, ${num(bulky)} of them bulky`],
          ['Break before', `${secs(element.breakBefore('full', d, n))} for the first${element.breakBefore('full', d, n + 1) > 0 ? '' : ', none after'}`],
          ['Bounty', 'None'],
          ...(p.essence ? [['Before the first', 'a Pure Essence'] as [string, string]] : []),
        ],
        lines: [
          `Each boss takes the next Trait in turn: ${BOSS_TRAITS.map((t) => TRAIT_NAME[t]).join(', ')}`,
          'They go on until the Run ends, and only add score',
        ],
      },
      {
        title: p.name,
        swatch: ELEMENT_COLOR.composite,
        tags: [ELEMENT_TAG('composite')],
        facts: [
          ...[1, 2, 3].map((k): [string, string] => [`Boss Wave ${k} HP`, num(element.bossHp(d, k, false))]),
          ['Bulky', `${num(element.bossHp(d, 1, true))} HP at Boss Wave 1`],
          ['Growth', `×${num(BOSS_HP_GROWTH)} each Boss Wave`],
          ['Speed', num(boss.speed)],
          ['Leak', `${plural(lives, 'life', 'lives')} (bulky ${num(bulkyLives)}); it walks the Lane again`],
        ],
        lines: BOSS_TRAITS.filter((t) => t !== 'bulky').map(traitLine),
        ranks: [elementRank('composite'), towerRank('composite', null, p.count, 'full', n)],
      },
    ],
  };
}

/** The Elementals that Lumber summons in Full: one row, with a section per Element and its HP by level. */
function elementalGroup(length: RunLength, d: Difficulty): ReferenceGroup {
  if (length === 'express') {
    const gates = Object.entries(EXPRESS_LEVEL_GATES).map(([level, gate]) => `level ${level} after Wave ${gate}`);
    return {
      id: 'elementals',
      head: {
        id: 'elementals',
        title: 'Elementals',
        summary: 'None in Express',
        sections: [{ lines: ['In Express each Lumber raises its Element at once: there is no Elemental to kill', `Levels open with the Waves cleared: ${both(gates)}`] }],
      },
      rows: [],
    };
  }
  const last = element.fixedWaves(length);
  const marks = [1, 5, 25, 50].filter((w) => w <= last);
  const hp = (level: number, wave: number): number => element.elementalHpAt(d, level, wave);
  const growth = hp(1, 5) / hp(1, 1);
  const sections = ELEMENTS.map((e): ReferenceSection => {
    const creep = ELEMENT_CREEPS[elementalId(e, 1)]!;
    return {
      title: creep.name,
      swatch: ELEMENT_COLOR[e],
      tags: [ELEMENT_TAG(e)],
      ranks: [elementRank(e)],
    };
  });
  const any = ELEMENT_CREEPS[elementalId(ELEMENTS[0], 1)]!;
  const lives = element.leakLivesFor(any, false);
  return {
    id: 'elementals',
    head: {
      id: 'elementals',
      title: 'Elementals',
      summary: `1 Lumber each · ${[1, 2, 3].map((l) => num(hp(l, 1))).join(' · ')} HP`,
      sections: [
        {
          facts: [
            ['Summon', '1 Lumber'],
            ...[1, 2, 3].map((l): [string, string] => [`Level ${l} HP`, num(hp(l, 1))]),
            ['HP growth', `×${num(growth)} every 5 Waves`],
            ['Speed', num(any.speed)],
            ['Bounty', 'None'],
            ['Leak', `${plural(lives, 'life', 'lives')}; it walks the Lane again`],
            ['Levels', `up to ${MAX_ELEMENT_LEVEL}`],
          ],
          lines: [
            'A Lumber summons the next level\'s Elemental of an Element; it walks the Lane like a creep, and killing it raises that Element',
            'Only one Elemental can be on the Lane at a time',
            `Level 1 by the Wave you wait for or fight: ${marks.map((w) => `${num(hp(1, w))} at Wave ${w}`).join(', ')}`,
            `All Pick gives ${plural(FREE_ELEMENTS, 'free Element')}: its first summon below level 2 needs no Elemental`,
            'All Random draws each Lumber\'s Element for you; its Elemental still has to be killed',
          ],
        },
        ...sections,
      ],
    },
    rows: [],
  };
}

/** 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${num(n)}${suffix}`;
}

/** "every 5th Wave" when the Waves are every k-th, else their list. */
function everyText(waves: readonly number[], what: string): string {
  const k = waves[0] ?? 0;
  const regular = k > 0 && waves.every((n, i) => n === k * (i + 1));
  return regular ? `${what} every ${ordinal(k)} Wave` : `${what} after ${waves.join(', ')}`;
}

// --- Filters ------------------------------------------------------------------------

const isDifficulty = (v: string | undefined): v is Difficulty => (DIFFICULTIES as readonly string[]).includes(v ?? '');
const isLength = (v: string | undefined): v is RunLength => (LENGTHS as readonly string[]).includes(v ?? '');

export interface ElementPick {
  readonly length: RunLength;
  readonly difficulty: Difficulty;
}

/** The length and Difficulty these values show. */
export function pickOf(values: ReferenceValues): ElementPick {
  const l = values['length'];
  const d = values['difficulty'];
  return { length: isLength(l) ? l : 'full', difficulty: isDifficulty(d) ? d : 'normal' };
}

function defaults(ctx: ReferenceContext): ReferenceValues {
  if (ctx.view) {
    const st = element.elementStatus(ctx.view.state);
    return { length: st.length, difficulty: st.difficulty };
  }
  const from = ctx.from ?? {};
  return { length: from['length'] ?? 'full', difficulty: from['difficulty'] ?? 'normal' };
}

function filters(values: ReferenceValues, ctx: ReferenceContext): ReferenceFilter[] {
  const p = pickOf(values);
  const locked = ctx.view ? { locked: 'Fixed for this Run' } : {};
  return [
    {
      id: 'length', label: 'Length', kind: 'seg', value: p.length,
      choices: LENGTHS.map((l) => ({
        id: l, label: `${LENGTH_NAME[l]} · ${element.fixedWaves(l)}`,
        about: `${element.fixedWaves(l)} Waves${l === 'full' ? ', then endless boss Waves' : ''}; `
          + `${gold(START[l].gold)} and ${plural(START[l].lumber, 'Lumber', 'Lumber')} to start`,
      })),
      ...locked,
    },
    {
      id: 'difficulty', label: 'Difficulty', kind: 'seg', value: p.difficulty, tabs: ['waves'],
      choices: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_NAME[d], about: difficultyAbout('element', d) })),
      ...locked,
    },
  ];
}

function waves(values: ReferenceValues): ReferenceTab {
  const p = pickOf(values);
  const rows: ReferenceRow[] = [];
  const fixed = element.fixedWaves(p.length);
  for (let n = 1; n <= fixed; n++) {
    const row = waveRow(p.length, p.difficulty, n);
    if (row) rows.push(row);
  }
  const boss = p.length === 'full' && element.waveTotal(p.length) > fixed ? bossRow(p.difficulty) : null;
  if (boss) rows.push(boss);
  const start = START[p.length];
  return {
    intro: [
      { text: gold(start.gold) },
      { text: plural(start.lumber, 'Lumber', 'Lumber') },
      { text: `${num(START_LIVES)} lives`, about: 'A Leak costs lives, and the creep walks the Lane again from the spawn' },
      {
        text: `Interest ${pct(INTEREST_RATE)}`,
        about: `Every ${INTEREST_PERIOD} s, uncapped; a Leak pauses it until that Wave is cleared, and it stops after Wave ${INTEREST_STOPS_AFTER[p.length]}`,
      },
      { text: everyText(LUMBER_AFTER[p.length], 'Lumber'), tone: 'good', about: `After Waves ${LUMBER_AFTER[p.length].join(', ')}` },
      { text: `Pure Essence ${ESSENCE_AFTER[p.length].join(', ')}`, tone: 'good', about: `A free Pure Essence after Waves ${both(ESSENCE_AFTER[p.length].map(String))}` },
    ],
    groups: [elementalGroup(p.length, p.difficulty), { id: 'waves', rows }],
  };
}

// --- The Towers tab ---------------------------------------------------------------

/** Waves of each Element, for Strong and Weak against. */
function wavesOf(length: RunLength, e: DamageElement): number[] {
  const out: number[] = [];
  for (let n = 1; n <= element.fixedWaves(length); n++) if (element.previewWave(length, 'normal', n - 1)?.element === e) out.push(n);
  return out;
}

/** Strong against / Weak against for damage `e` over the cycle, with the Waves of each Element. */
export function strengths(e: DamageElement, length: RunLength): ReferenceSection[] {
  const prof = armorProfile(e, DAMAGES, share);
  const where = (armor: string): string => {
    const ns = wavesOf(length, armor as DamageElement);
    return ns.length > 0 ? `Waves ${ns.join(', ')}` : '';
  };
  const tag = (armor: string, s: number, tone: 'good' | 'bad'): ReferenceTag => ({ text: `${damageName(armor as DamageElement)} ${pct(s)}`, tone, about: where(armor) });
  const named = (rows: readonly { armor: string; share: number }[]): string[] =>
    rows.map((r) => `${damageName(r.armor as DamageElement)} ${pct(r.share)}: ${where(r.armor)}`).filter((l) => !l.endsWith(': '));
  return [
    {
      title: 'Strong against',
      tags: prof.even ? [{ text: `Every Element ${pct(share(e, DAMAGES[0]!))}`, tone: 'good' }] : prof.strong.map((r) => tag(r.armor, r.share, 'good')),
      ...(prof.even ? {} : { lines: named(prof.strong) }),
    },
    {
      title: 'Weak against',
      tags: prof.weak.length > 0 ? prof.weak.map((r) => tag(r.armor, r.share, 'bad')) : [{ text: 'Nothing', tone: 'good' }],
      ...(prof.weak.length > 0 ? { lines: named(prof.weak) } : {}),
    },
  ];
}

const SUPPORT_ABILITIES: ReadonlySet<string> = new Set(['fireUp', 'springForward', 'conjure']);

/** One tower: its price, attack, levels, Element requirements, what it comes from and becomes, its sale, and Strong and Weak against. */
function towerRow(id: string, length: RunLength): ReferenceRow {
  const s = spec(id);
  const info = s.element;
  const facts: [string, string][] = [];
  const from = FROM.get(id) ?? [];
  facts.push([from.length > 0 ? 'Upgrade' : 'Build', `${gold(s.cost ?? 0)}${info.essence > 0 ? ` and ${plural(info.essence, 'Pure Essence', 'Pure Essence')}` : ''}`]);
  if (info.totalCost !== (s.cost ?? 0)) facts.push(['Total', gold(info.totalCost)]);
  facts.push(['Needs', needsText(id)]);
  if (info.elements.length > 0) facts.push(['Elements', both(ELEMENTS.filter((e) => info.elements.includes(e)).map(elementName))]);
  if (info.baseDamage > 0) facts.push(['Damage', num(info.baseDamage)]);
  facts.push(['Deals', damageName(info.damage)]);
  if (s.attack || info.ability?.kind === 'pulse' || info.ability?.kind === 'tornado') facts.push(['Speed', rate(info.cooldown)]);
  facts.push(['Range', num(info.range)]);
  if (info.splash) facts.push(['Splash', `${num(info.splash.full)} full, ${num(info.splash.half)} half`]);
  facts.push(['Builds in', secs(info.buildTime)]);
  if (from.length > 0) facts.push(['From', either(from.map((x) => spec(x).name))]);
  const ups = info.upgrades.map((x) => `${spec(x).name} (${gold(spec(x).cost ?? 0)})`);
  if (ups.length === 1) facts.push(['Upgrades to', ups[0]!]);
  else if (ups.length > 1) facts.push(['Becomes', either(ups)]);
  facts.push(['Sells for', `${gold(element.saleValue(info, 'allPick'))} · ${num(element.saleValue(info, 'allRandom'))} in All Random`]);
  const support = info.ability !== undefined && SUPPORT_ABILITIES.has(info.ability.kind);
  const lead = info.kind === 'single' || info.kind === 'dual' || info.kind === 'triple' ? `L${info.level}` : undefined;
  return {
    id: `tower-${id}`,
    ...(lead ? { lead } : {}),
    title: s.name,
    summary: [gold(s.cost ?? 0), needsText(id)].join(' · '),
    swatch: ELEMENT_COLOR[info.damage],
    tags: support ? [{ text: 'Support', tone: 'trait', about: 'Buffs or copies another tower' }] : [],
    sections: [
      { facts, lines: abilityLines(s) },
      ...(info.kind === 'periodic' ? [{ lines: ['Its six shots hit as each Element in turn'] }] : strengths(info.damage, length)),
    ],
  };
}

const KIND_TITLE: Readonly<Record<TowerKind, string>> = {
  basic: 'Arrow and Cannon', elementalBasic: 'Elemental Arrows and Cannons', single: 'Singles', pure: 'Pure towers',
  dual: 'Duals', triple: 'Triples', periodic: 'Periodic',
};
const KIND_TABS: readonly TowerKind[] = ['basic', 'elementalBasic', 'single', 'pure', 'dual', 'triple', 'periodic'];

/** A kind's towers in the sheet's order: Arrows then Cannons by Element, singles by Element, duals and triples by line; levels in order. */
function towersOfKind(kind: TowerKind): string[] {
  const ids = TOWER_IDS.filter((id) => spec(id).element.kind === kind);
  const lines = [...new Set(ids.map((id) => spec(id).element.family))];
  const line = (id: string): number => lines.indexOf(spec(id).element.family);
  const el = (id: string): number => ELEMENTS.indexOf(spec(id).element.elements[0] ?? ELEMENTS[0]);
  const level = (id: string): number => spec(id).element.level;
  const byElement = kind === 'single' || kind === 'pure';
  return [...ids].sort((a, b) => (byElement ? el(a) - el(b) : line(a) - line(b) || el(a) - el(b)) || level(a) - level(b));
}

/** A kind's heading row: how its towers come, their step prices by level, and how many Elements they need. */
function kindHead(kind: TowerKind, ids: readonly string[]): ReferenceRow {
  const levels = [...new Set(ids.map((id) => spec(id).element.level))].sort((a, b) => a - b);
  const costs = levels.map((l) => [...new Set(ids.filter((id) => spec(id).element.level === l).map((id) => spec(id).cost ?? 0))].sort((a, b) => a - b));
  const prices = levels.map((l, i): [string, string] => [levels.length > 1 ? `Level ${l}` : 'Price', either(costs[i]!.map(gold))]);
  const fromKinds = [...new Set(ids.flatMap((id) => (FROM.get(id) ?? []).filter((x) => spec(x).element.kind !== kind).map((x) => KIND_TITLE[spec(x).element.kind])))];
  const count = [...new Set(ids.map((id) => spec(id).element.elements.length))];
  const facts: [string, string][] = [
    ['Towers', num(ids.length)],
    ...prices,
    fromKinds.length > 0 ? ['From', either(fromKinds)] : ['Build', 'from nothing'],
    ...(count.length === 1 && count[0]! > 0 ? [['Elements', num(count[0]!)] as [string, string]] : []),
  ];
  return {
    id: `kind-${kind}`,
    title: KIND_TITLE[kind],
    summary: `${costs.map((c) => either(c.map(num))).join(' · ')} gold`,
    sections: [{ facts }],
  };
}

function towers(values: ReferenceValues): ReferenceTab {
  const p = pickOf(values);
  const groups = KIND_TABS.map((kind): ReferenceGroup => {
    const ids = towersOfKind(kind);
    return { id: `kind-${kind}`, head: kindHead(kind, ids), rows: ids.map((id) => towerRow(id, p.length)) };
  });
  return {
    intro: [
      { text: `Sells ${pct(SELL.normal)}`, about: `Arrow and Cannon lines ${pct(SELL.arrowCannon)}; every tower ${pct(SELL.random)} in All Random` },
      { text: 'Build any time', about: 'Build, upgrade and sell mid-Wave too, once a tower is built' },
      { text: 'Levels from Elements', about: 'Element levels open tower levels; how many Elements you hold opens duals and triples' },
      { text: 'No flyers', about: 'Every tower hits every creep' },
      ...(p.length === 'express' ? [{ text: `Express: level 2 after Wave ${EXPRESS_LEVEL_GATES[2]}, 3 after ${EXPRESS_LEVEL_GATES[3]}`, tone: 'bad' as const }] : []),
    ],
    groups,
  };
}

export const ELEMENT_REFERENCE: ModeReference = {
  defaults,
  filters,
  waves,
  towers,
  current(view, values) {
    const st = element.elementStatus(view.state);
    if (st.step === 'over' || pickOf(values).length !== st.length) return { now: null, next: null };
    // During a Break, Now is the Wave it counts down to (Wave 1 before the first).
    const n = st.step === 'wave' ? Math.max(1, st.wave) : st.break?.wave ?? st.wave + 1;
    const id = (k: number): string | null => (k <= st.fixedWaves ? `wave-${k}` : st.length === 'full' && k <= element.waveTotal(st.length) ? 'boss' : null);
    const now = id(n);
    const next = id(n + 1);
    return { now, next: next === now ? null : next };
  },
};


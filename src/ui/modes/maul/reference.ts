import {
  AIR_WAVES, ARMOR_TYPES, ATTACK_TYPES, BOSS_SLOW_FLOOR, BREAK_SECONDS, FIRST_BREAK_SECONDS, INTEREST_RATE, MAUL_CREEPS,
  MAUL_DAMAGE_TABLE, MAUL_MAP, MAUL_TOWERS, MAUL_WAVES, RACE_SPECS, RACES, SECOND_RACE_AFTER, SELL_SHARE, SLOW_KEY, SPORE_KEY,
  START_GOLD, START_LIVES, TROLL_REGEN,
  type ArmorType, type AttackType, type MaulCreepSpec, type MaulTowerSpec, type RaceId,
} from '../../../content/maul';
import { DIFFICULTIES, maul, spawnCount, type Difficulty } from '../../../sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../../catalog';
import { num } from '../../format';
import { armorProfile, rankCounters, type CounterCandidate, type CounterEdge, type CounterTarget } from '../../reference/counters';
import type {
  ModeReference, ReferenceChoice, ReferenceContext, ReferenceFilter, ReferenceGroup, ReferenceRank, ReferenceRankItem, ReferenceRow,
  ReferenceSection, ReferenceTab, ReferenceTag, ReferenceValues,
} from '../../reference/types';
import { MAUL_LOOK, RACE_COLOR } from './look';
import { abilityLines, ARMOR_NAME, ATTACK_NAME, KIND_TAG, raceName, racesText, rate, tierName } from './text';

// Maul's Waves & Towers sheet (ModeUi.reference): the 40 Waves with their
// creeps and Best against, and the four Races' Walls and lines. Line Wars
// shares the creeps' Best against and the tower rows (src/ui/modes/linewars/
// reference.ts) with its own sells and creeps. Every number comes from the
// content tables and the sim's queries; the words are text.ts's and the
// content's role lines and hints.

/** "150%", "8.3%". */
export function pct(fraction: number): string {
  return `${num(Math.round(fraction * 1000) / 10)}%`;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;
/** Gold to the hundredth, as a bounty is split: "0.98", "1.5", "3". */
const cents = (n: number): string => (Number.isInteger(n) ? num(n) : n.toFixed(2).replace(/0$/, ''));
const either = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)!}`);
const both = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);

// --- The Race filter -------------------------------------------------------------

/** The filter value for every Race. */
export const ALL_RACES = 'all';

const isRace = (v: string): v is RaceId => (RACES as readonly string[]).includes(v);

/** The Races a filter value shows: `all`, one Race, or two joined by `+` (a Run's two). */
export function racesOf(value: string | undefined): RaceId[] {
  if (value === undefined || value === ALL_RACES) return [...RACES];
  const picked = value.split('+').filter(isRace);
  return picked.length > 0 ? RACES.filter((r) => picked.includes(r)) : [...RACES];
}

/** The filter value that shows `races`. */
export function raceValue(races: readonly RaceId[]): string {
  return races.length === 0 || races.length === RACES.length ? ALL_RACES : RACES.filter((r) => races.includes(r)).join('+');
}

/** All Races, each Race, and any pair among `pairs` (a Run's two). */
export function raceChoices(pairs: readonly (readonly RaceId[])[] = []): ReferenceChoice[] {
  const out: ReferenceChoice[] = [
    { id: ALL_RACES, label: 'All Races' },
    ...RACES.map((r) => ({ id: r, label: raceName(r), about: RACE_SPECS[r].about })),
  ];
  for (const p of pairs) {
    const id = raceValue(p);
    if (p.length > 1 && !out.some((c) => c.id === id)) out.push({ id, label: racesText(RACES.filter((r) => p.includes(r))) });
  }
  return out;
}

// --- What hits what --------------------------------------------------------------

/** A damage key for the counters: Maul's attack types, and poison, which skips the table and armor. */
export type HitType = AttackType | 'poison';

const HIT_NAME: Readonly<Record<HitType, string>> = { ...ATTACK_NAME, poison: 'Poison' };

/** The attack table's share, with poison at full damage against every armor. */
export function hitShare(damage: string, armor: string): number {
  return damage === 'poison' ? 1 : MAUL_DAMAGE_TABLE[damage as AttackType][armor as ArmorType];
}

const TOWER_IDS = Object.keys(MAUL_TOWERS);
const tower = (id: string): MaulTowerSpec => MAUL_TOWERS[id]!;

/** A tower's line in upgrade order: Tier 1, Tier 2, then both Tier 3 forks. */
export function lineOf(race: RaceId, line: 'a' | 'b'): string[] {
  const t1 = RACE_SPECS[race].builds[line === 'a' ? 1 : 2];
  const t2 = tower(t1).maul.next[0]!;
  return [t1, t2, ...tower(t2).maul.next];
}

/** Every tower of a Race in the sheet's order: the Wall, then line A, then line B. */
export function raceTowers(race: RaceId): string[] {
  return [RACE_SPECS[race].builds[0], ...lineOf(race, 'a'), ...lineOf(race, 'b')];
}

type Effect = { readonly kind: string } & Readonly<Record<string, unknown>>;
const effectsOf = (spec: MaulTowerSpec): readonly Effect[] => (spec.attack?.effects ?? []) as readonly Effect[];
const hasEffect = (spec: MaulTowerSpec, ...kinds: string[]): boolean => effectsOf(spec).some((e) => kinds.includes(e.kind));

/** Where a tower's poison lands: venom and spores go where its attack does, rot where its aura reaches. */
function poisonLayer(spec: MaulTowerSpec): 'ground' | 'air' | 'both' | null {
  if (spec.attack && hasEffect(spec, 'maul.venom', 'maul.spread')) return spec.attack.targets;
  const rot = spec.auras?.find((a) => a.kind === 'poison' && a.to === 'creeps');
  return rot ? (rot.targets ?? 'both') : null;
}

/** A tower hits air with its attack, or with the poison it spreads. */
function hitsAirWith(spec: MaulTowerSpec, type: HitType): boolean {
  if (type === 'poison') return poisonLayer(spec) !== 'ground' && poisonLayer(spec) !== null;
  return spec.attack !== undefined && spec.attack.targets !== 'ground';
}

/** Towers that deal `type`: their attack's type, or for poison their venom, spores or rot. */
function dealers(type: HitType): string[] {
  return TOWER_IDS.filter((id) => (type === 'poison' ? poisonLayer(tower(id)) !== null : tower(id).attack?.attackType === type));
}

/** Tower names, a whole line named by its Tier 1: "the Dart Tower line", "Void Rune". */
function towerNames(ids: readonly string[]): string[] {
  const out: string[] = [];
  const done = new Set<string>();
  for (const id of ids) {
    if (done.has(id)) continue;
    const m = tower(id).maul;
    const line = m.line === 'wall' ? [] : lineOf(m.race, m.line);
    if (line.length > 0 && line.every((x) => ids.includes(x))) {
      out.push(`the ${tower(line[0]!).name} line`);
      for (const x of line) done.add(x);
    } else {
      out.push(tower(id).name);
      done.add(id);
    }
  }
  return out;
}

interface HitCandidate extends CounterCandidate {
  readonly type: HitType;
  /** Who of this type hits air, when only some do. */
  readonly airOnly: readonly string[];
}

/** Each attack type, and poison: hitting air when any of its towers does. */
const HIT_CANDIDATES: readonly HitCandidate[] = [...ATTACK_TYPES, 'poison' as const].map((type) => {
  const of = dealers(type);
  const air = of.filter((id) => hitsAirWith(tower(id), type));
  return { id: type, type, damage: type, hitsAir: air.length > 0, airOnly: air.length > 0 && air.length < of.length ? towerNames(air) : [] };
});

const SLOWS = (spec: MaulTowerSpec): boolean =>
  hasEffect(spec, 'slow') || (spec.auras ?? []).some((a) => a.kind === 'slow' && a.to === 'creeps');
const HITS_MANY = (spec: MaulTowerSpec): boolean =>
  hasEffect(spec, 'splash', 'maul.spread', 'multishot', 'maul.chain') || (spec.auras ?? []).some((a) => a.kind === 'poison' && a.to === 'creeps');

interface LineCandidate extends CounterCandidate {
  readonly race: RaceId;
  readonly line: 'a' | 'b';
  readonly towers: readonly string[];
  readonly slows: boolean;
  /** Tier 1 or 2 hits several creeps at once: splash, spores, extra bolts, chains. */
  readonly many: boolean;
  /** Its venom or spores from Tier 1: poison skips armor. */
  readonly poison: 'venom' | 'spores' | null;
}

/** A Race's two lines as counters: the Tier 1's attack type, hitting air when Tiers 1 and 2 both do. */
function lineCandidate(race: RaceId, line: 'a' | 'b'): LineCandidate {
  const towers = lineOf(race, line);
  const [t1, t2] = [tower(towers[0]!), tower(towers[1]!)];
  return {
    id: `${race}:${line}`, race, line, towers, damage: t1.attack!.attackType,
    hitsAir: [t1, t2].every((t) => t.attack !== undefined && t.attack.targets !== 'ground'),
    slows: SLOWS(t1) || SLOWS(t2),
    many: HITS_MANY(t1) || HITS_MANY(t2),
    poison: hasEffect(t1, 'maul.venom') ? 'venom' : hasEffect(t1, 'maul.spread') ? 'spores' : null,
  };
}

const lineName = (c: LineCandidate): string => tower(c.towers[0]!).name;

/** Maul's rules beyond the table, for a line against a creep: they only order lines the table ties. */
function lineEdges(c: LineCandidate, spec: MaulCreepSpec): CounterEdge[] {
  const edges: CounterEdge[] = [];
  const kind = spec.maul.kind;
  if (c.poison && spec.armor > 0) edges.push({ edge: 1, why: `${c.poison} ${c.poison === 'spores' ? 'skip' : 'skips'} its ${num(spec.armor)} armor` });
  if (c.slows && kind === 'boss') edges.push({ edge: -1, why: `bosses can't be slowed below ${pct(BOSS_SLOW_FLOOR)} speed` });
  else if (c.slows && spec.maul.unslowable) edges.push({ edge: -1, why: 'slows can\'t touch it' });
  else if (c.slows && kind === 'fast') edges.push({ edge: 1, why: 'its slows hold it back' });
  if (c.many && kind === 'swarm') edges.push({ edge: 1, why: c.poison === 'spores' ? 'spores catch several at once' : 'splash hits several at once' });
  return edges;
}

/** Notes that don't move a line: a fork that hits this creep harder, or hits a swarm many at a time. */
function lineNotes(c: LineCandidate, spec: MaulCreepSpec): string[] {
  const notes: string[] = [];
  const base = hitShare(c.damage, spec.armorType);
  for (const id of c.towers.slice(2)) {
    const atk = tower(id).attack;
    if (!atk || atk.attackType === c.damage) continue;
    const s = hitShare(atk.attackType, spec.armorType);
    if (s > base) notes.push(`${tower(id).name} hits it as ${ATTACK_NAME[atk.attackType as AttackType]}, ${pct(s)}`);
  }
  if (spec.maul.kind === 'swarm' && !c.many) {
    const forks = c.towers.slice(2).filter((id) => HITS_MANY(tower(id)));
    if (forks.length > 0) notes.push(`${both(forks.map((id) => tower(id).name))} ${forks.length === 1 ? 'hits' : 'hit'} several at once`);
  }
  return notes;
}

export interface BestAgainst {
  /** Attack types, and poison, by the attack table. */
  readonly attacks: ReferenceRank;
  /** The lines of the Races shown, by the table and then Maul's rules. */
  readonly lines: ReferenceRank;
}

const withWhy = (item: Omit<ReferenceRankItem, 'why'>, why: readonly string[]): ReferenceRankItem =>
  (why.length > 0 ? { ...item, why } : item);

/** Best against for one creep: attack types by Maul's attack table, then the lines of `races` that can hit it. */
export function bestAgainst(spec: MaulCreepSpec, races: readonly RaceId[]): BestAgainst {
  const target: CounterTarget = { armor: spec.armorType, air: spec.flying };
  const hits = rankCounters(target, HIT_CANDIDATES, {
    share: hitShare,
    edges: (c) => (c.type === 'poison' && spec.armor > 0 ? [{ edge: 1, why: `poison skips its ${num(spec.armor)} armor` }] : []),
  });
  const attacks: ReferenceRank = {
    label: 'Best against',
    items: hits.ranked.map((r) => withWhy(
      { text: HIT_NAME[r.candidate.type], value: pct(r.share), rank: r.rank },
      [...r.why, ...(spec.flying && r.candidate.airOnly.length > 0 ? [`only ${both(r.candidate.airOnly)} ${r.candidate.airOnly.length === 1 ? 'hits' : 'hit'} air`] : [])],
    )),
    ...(hits.cannot.length > 0 ? { note: `Can't hit air: ${hits.cannot.map((c) => HIT_NAME[c.type]).join(', ')}` } : {}),
  };
  const candidates = races.flatMap((race) => [lineCandidate(race, 'a'), lineCandidate(race, 'b')]);
  const ranked = rankCounters(target, candidates, { share: hitShare, edges: (c) => lineEdges(c, spec) });
  const lines: ReferenceRank = {
    label: 'Lines',
    items: ranked.ranked.map((r) => withWhy(
      { text: lineName(r.candidate), value: pct(r.share), rank: r.rank },
      [...r.why, ...lineNotes(r.candidate, spec)],
    )),
    ...(ranked.cannot.length > 0 ? { note: `Can't hit air: ${ranked.cannot.map(lineName).join(', ')}` } : {}),
  };
  return { attacks, lines };
}

// --- Creeps ----------------------------------------------------------------------

/** A creep's colour on the board. */
export function creepColor(id: string): number {
  const spec = MAUL_CREEPS[id];
  return (spec ? MAUL_LOOK.creep?.(id, spec).color : undefined) ?? 0xcccccc;
}

/** A creep's tags: its kind's (Swarm, Fast, Armored…), Air and Boss in their own colours. */
export function creepTagList(spec: MaulCreepSpec, lastBoss = false): ReferenceTag[] {
  const kind = spec.maul.kind;
  if (spec.flying) return [{ text: 'Air', tone: 'air', about: 'Flies straight over the maze' }];
  if (kind === 'boss') return [{ text: lastBoss ? 'Last boss' : 'Boss', tone: 'boss' }];
  const tag = KIND_TAG[kind];
  return tag ? [{ text: tag, tone: 'trait' }] : [];
}

/** How to beat it (the content's hint), then the rule a boss brings, with its number. */
export function creepLines(spec: MaulCreepSpec): string[] {
  const lines = [spec.maul.hint];
  if (spec.maul.kind === 'boss') lines.push(`Can't be slowed below ${pct(BOSS_SLOW_FLOOR)} of its speed; a stun still holds it`);
  return lines;
}

/** A creep's HP, armor and speed, and a Troll's healing, as both modes list them first. */
export function creepFacts(spec: MaulCreepSpec, hp: number): [string, string][] {
  return [
    ['HP', num(hp)], ['Armor', `${ARMOR_NAME[spec.armorType]} ${num(spec.armor)}`], ['Speed', num(spec.speed)],
    ...(spec.maul.kind === 'regen' ? [['Heals', `${pct(TROLL_REGEN)} of its max HP a second`] as [string, string]] : []),
  ];
}

// --- Towers ----------------------------------------------------------------------

/** What differs between Maul's tower rows and Line Wars'. */
export interface TowerRules {
  /** The creeps a tower meets, for Strong and Weak against: Maul's, or Line Wars' Sends'. */
  readonly creeps: Readonly<Record<string, MaulCreepSpec>>;
  /** What selling a tower that cost `total` gold returns. */
  sells(total: number): string;
  /** Under a Wall: what else it can become. */
  readonly wallLines: readonly string[];
  /** Facts on a Race's heading row. */
  raceFacts(race: RaceId): readonly (readonly [string, string])[];
  /** Tags on a Race's heading row, such as Line Wars' You and Rival. */
  raceTags?(race: RaceId): readonly ReferenceTag[];
}

function creepsOf(armor: string, creeps: TowerRules['creeps']): string[] {
  return Object.values(creeps).filter((c) => c.armorType === armor).map((c) => c.name);
}

/** Strong against / Weak against for a hit type over Maul's armor types, with Air when it can't hit flyers. */
export function strengths(type: HitType, air: boolean, creeps: TowerRules['creeps']): ReferenceSection[] {
  const prof = armorProfile(type, ARMOR_TYPES, hitShare);
  const tag = (armor: string, s: number, tone: 'good' | 'bad'): ReferenceTag => ({
    text: `${ARMOR_NAME[armor as ArmorType]} ${pct(s)}`, tone, about: creepsOf(armor, creeps).join(', '),
  });
  const strong = prof.even
    ? [{ text: `Every armor ${pct(hitShare(type, ARMOR_TYPES[0]))}`, tone: 'good' as const }]
    : prof.strong.map((r) => tag(r.armor, r.share, 'good'));
  const weak = prof.weak.map((r) => tag(r.armor, r.share, 'bad'));
  const flyers = Object.values(creeps).filter((c) => c.flying).map((c) => c.name);
  if (!air) weak.push({ text: 'Air', tone: 'bad', about: flyers.join(', ') });
  const named = (rows: readonly { armor: string }[]): string[] =>
    rows.map((r) => `${ARMOR_NAME[r.armor as ArmorType]}: ${creepsOf(r.armor, creeps).join(', ')}`).filter((l) => !l.endsWith(': '));
  return [
    { title: 'Strong against', tags: strong, ...(prof.even ? {} : { lines: named(prof.strong) }) },
    {
      title: 'Weak against', tags: weak.length > 0 ? weak : [{ text: 'Nothing', tone: 'good' }],
      ...(prof.weak.length > 0 || !air ? { lines: [...named(prof.weak), ...(air ? [] : [`Air: ${flyers.join(', ')}`])] } : {}),
    },
  ];
}

const hitsText = (targets: 'ground' | 'air' | 'both'): string =>
  (targets === 'both' ? 'Ground and air' : targets === 'ground' ? 'Ground only' : 'Air only');

/** The rules behind a tower's effects that its ability lines don't say: what stacks, and what skips armor. */
function ruleLines(spec: MaulTowerSpec): string[] {
  const lines: string[] = [];
  const slowKeys = [
    ...effectsOf(spec).filter((e) => e.kind === 'slow').map((e) => e['key']),
    ...(spec.auras ?? []).filter((a) => a.kind === 'slow').map((a) => a.key),
  ];
  if (slowKeys.includes(SLOW_KEY)) lines.push('Slows don\'t stack: only the strongest slow on a creep counts');
  if (hasEffect(spec, 'maul.venom')) lines.push('Each tower\'s venom ticks on its own: venom from several towers stacks, one tower\'s never does');
  if (effectsOf(spec).some((e) => e.kind === 'maul.spread' && e['key'] === SPORE_KEY)) lines.push('One spore cloud ticks on a creep at a time, beside venom and rot');
  if (poisonLayer(spec) !== null) lines.push('Poison skips the attack table and armor');
  return lines;
}

/** "80 full, 150 half": a splash's bands. */
function splashText(spec: MaulTowerSpec): string | null {
  const s = effectsOf(spec).find((e) => e.kind === 'splash');
  const bands = s?.['bands'] as readonly (readonly [number, number])[] | undefined;
  return bands ? bands.map(([r, k]) => `${num(r)} ${k === 1 ? 'full' : k === 0.5 ? 'half' : pct(k)}`).join(', ') : null;
}

/** "Ballista or Mortar · 40 or 50 gold". */
function nextText(ids: readonly string[]): string {
  const prices = [...new Set(ids.map((id) => tower(id).maul.price))];
  return `${either(ids.map((id) => tower(id).name))} · ${prices.map(num).join(' or ')} gold`;
}

/** One tower: its price, its attack, what it becomes, what a sale returns, and what it is strong and weak against. */
export function towerRow(id: string, rules: TowerRules): ReferenceRow {
  const spec = tower(id);
  const m = spec.maul;
  const a = maul.attackInfo(id);
  const facts: [string, string][] = [];
  if (m.tier <= 1) facts.push(['Build', `${num(m.total)} gold`]);
  if (m.tier === 1) facts.push(['From a Wall', `${num(m.price)} gold`]);
  if (m.tier >= 2) facts.push(['Upgrade', `${num(m.price)} gold`], ['Total', `${num(m.total)} gold`]);
  if (a) {
    facts.push(
      ['Damage', `${num(a.damage[0])}–${num(a.damage[1])}`],
      ['Type', ATTACK_NAME[a.type]],
      ['Speed', rate(spec.attack!.cooldown)],
      ['DPS', num(Math.round(a.dps * 10) / 10)],
      ['Range', num(a.range)],
      ['Hits', hitsText(a.targets)],
    );
  }
  const splash = splashText(spec);
  if (splash) facts.push(['Splash', splash]);
  const aura = Math.max(0, ...(spec.auras ?? []).map((x) => x.radius));
  if (aura > 0) facts.push(['Aura', num(aura)]);
  if (m.tier === 0) facts.push(['Becomes', nextText(maul.nextFor([m.race], id))]);
  else if (m.next.length === 1) facts.push(['Upgrades to', nextText(m.next)]);
  else if (m.next.length > 1) facts.push(['Forks into', nextText(m.next)]);
  facts.push(['Sells for', rules.sells(m.total)]);
  const layer = a?.targets ?? poisonLayer(spec) ?? 'both';
  const air = layer !== 'ground';
  const type: HitType | null = a ? a.type : poisonLayer(spec) !== null ? 'poison' : null;
  const lines = [m.role, ...abilityLines(spec), ...ruleLines(spec), ...(m.tier === 0 ? rules.wallLines : [])];
  const summary = a
    ? [`${num(m.tier <= 1 ? m.total : m.price)} gold`, `${num((a.damage[0] + a.damage[1]) / 2)} ${ATTACK_NAME[a.type]}`, rate(spec.attack!.cooldown), `range ${num(a.range)}`]
    : [`${num(m.price)} gold`, ...(aura > 0 ? [`aura ${num(aura)}`] : [])];
  return {
    id: `tower-${id}`,
    lead: m.tier === 0 ? 'Wall' : `T${m.tier}`,
    title: spec.name,
    summary: summary.join(' · '),
    swatch: RACE_COLOR[m.race],
    tags: air ? [] : [{ text: 'Ground only', tone: 'bad', about: 'Can\'t hit flying creeps' }],
    sections: [
      { title: m.line === 'wall' ? tierName(0) : `${tierName(m.tier)} · the ${tower(lineOf(m.race, m.line)[0]!).name} line`, facts, lines },
      ...(type ? strengths(type, air, rules.creeps) : []),
    ],
  };
}

/** A Race's heading row: its role, its lines from the Wall to the forks, which line can't hit air, and the mode's facts. */
function raceHead(race: RaceId, rules: TowerRules): ReferenceRow {
  const r = RACE_SPECS[race];
  const wall = tower(r.builds[0]);
  const types: HitType[] = [];
  for (const id of raceTowers(race)) {
    const t = tower(id);
    for (const type of [t.attack?.attackType as AttackType | undefined, poisonLayer(t) !== null ? 'poison' as const : undefined]) {
      if (type && !types.includes(type)) types.push(type);
    }
  }
  const ground = (['a', 'b'] as const).map((l) => lineCandidate(race, l)).filter((c) => !c.hitsAir).map(lineName);
  const path = (l: 'a' | 'b'): string => {
    const [t1, t2, ...forks] = lineOf(race, l).map((id) => tower(id).name);
    return `${wall.name} → ${t1!} → ${t2!} → ${either(forks)}`;
  };
  return {
    id: `race-${race}`,
    title: r.name,
    summary: types.map((t) => HIT_NAME[t]).join(', '),
    swatch: RACE_COLOR[race],
    tags: rules.raceTags?.(race) ?? [],
    sections: [{
      title: 'Lines',
      facts: [
        ['Wall', `${num(wall.maul.total)} gold`],
        [ground.length > 0 ? 'Can\'t hit air' : 'Hits air', ground.length > 0 ? both(ground) : 'Every line'],
        ...rules.raceFacts(race),
      ],
      lines: [r.about, path('a'), path('b')],
    }],
  };
}

/** The Towers tab's groups: a Race each, its heading row, then its Wall and both lines. */
export function raceGroups(races: readonly RaceId[], rules: TowerRules): ReferenceGroup[] {
  return races.map((race) => ({ id: `race-${race}`, head: raceHead(race, rules), rows: raceTowers(race).map((id) => towerRow(id, rules)) }));
}

/** The line under the Towers tab: what the DPS figure counts. */
export const DPS_NOTE = 'DPS is against one creep at full damage, before splash, extra targets, poison and auras';

// --- Maul's filters ----------------------------------------------------------------

const isDifficulty = (v: string | undefined): v is Difficulty => (DIFFICULTIES as readonly string[]).includes(v ?? '');

export interface MaulPick {
  readonly races: readonly RaceId[];
  readonly difficulty: Difficulty;
}

/** The Races and Difficulty these values show. */
export function pickOf(values: ReferenceValues): MaulPick {
  const d = values['difficulty'];
  return { races: racesOf(values['race']), difficulty: isDifficulty(d) ? d : 'normal' };
}

function defaults(ctx: ReferenceContext): ReferenceValues {
  if (ctx.view) {
    const st = maul.maulStatus(ctx.view.state);
    return { race: raceValue(st.races), difficulty: st.difficulty };
  }
  const from = ctx.from ?? {};
  return { race: from['race'] ?? ALL_RACES, difficulty: from['difficulty'] ?? 'normal' };
}

function filters(values: ReferenceValues, ctx: ReferenceContext): ReferenceFilter[] {
  const p = pickOf(values);
  const run = ctx.view ? maul.maulStatus(ctx.view.state).races : [];
  return [
    { id: 'race', label: 'Race', kind: 'select', value: raceValue(p.races), choices: raceChoices([run, p.races]) },
    {
      id: 'difficulty', label: 'Difficulty', kind: 'seg', value: p.difficulty, tabs: ['waves'],
      choices: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_NAME[d], about: difficultyAbout('maul', d) })),
      ...(ctx.view ? { locked: 'Fixed for this Run' } : {}),
    },
  ];
}

// --- The Waves tab -----------------------------------------------------------------

const SPAWNS = spawnCount(MAUL_MAP);
const GATE_NAME = ['West', 'East'] as const;
const BOSS_WAVES = MAUL_WAVES.flatMap((w, i) => (MAUL_CREEPS[w.creep]?.maul.kind === 'boss' ? [i + 1] : []));

/** The least gold held at a clear that earns the whole interest cap on Wave `wave`. */
function capAt(wave: number): number {
  const cap = maul.waveBonus(wave);
  let gold = Math.max(0, Math.floor(cap / INTEREST_RATE) - 2);
  while (maul.interestOn(gold, wave) < cap) gold++;
  return gold;
}

/** Wave `n` at `p`'s Difficulty as a row: its creeps in one line, the Wave's gold, and each creep in full. */
function waveRow(p: MaulPick, n: number): ReferenceRow | null {
  const row = MAUL_WAVES[n - 1];
  const w = maul.previewWave(MAUL_WAVES, n, maul.hpScaleFor(p.difficulty), SPAWNS);
  if (!row || !w) return null;
  const last = n === MAUL_WAVES.length;
  const groups = maul.waveGroups(row, n, SPAWNS);
  // The pool is split by each creep's share of the Wave's HP, as the sim splits it when the Wave starts.
  const hpAll = w.groups.reduce((sum, g) => sum + g.count * g.hp, 0);
  const rate = maul.bountyRate(n, hpAll);
  const gates = w.spawns.map((s) => GATE_NAME[s] ?? `Gate ${s + 1}`);
  const tags: ReferenceTag[] = [];
  for (const g of w.groups) {
    for (const t of creepTagList(MAUL_CREEPS[g.creep]!, last)) if (!tags.some((x) => x.text === t.text)) tags.push(t);
  }
  const wave: ReferenceSection = {
    facts: [
      ['Creeps', num(w.groups.reduce((sum, g) => sum + g.count, 0))],
      ['Gates', both(gates)],
      ['Bounty pool', `${num(w.bounty)} gold`],
      ['Wave bonus', `${num(w.bonus)} gold`],
      ['Interest', `${pct(INTEREST_RATE)}, up to ${num(w.bonus)} gold`],
      ['Full interest', `at ${num(capAt(n))} gold held`],
      ['Brawler HP', num(Math.max(1, Math.round(maul.raiderHp(n) * maul.hpScaleFor(p.difficulty))))],
      ['Break before', `${num(n === 1 ? FIRST_BREAK_SECONDS : BREAK_SECONDS)} s`],
    ],
  };
  const sections = w.groups.map((g): ReferenceSection => {
    const spec = MAUL_CREEPS[g.creep]!;
    const perGate = groups.filter((x) => x.creep === g.creep).map((x) => x.count);
    const where = perGate.length > 1 && perGate.every((c) => c === perGate[0]) ? `${num(perGate[0]!)} from each Gate` : `from ${both(gates)}`;
    const best = bestAgainst(spec, p.races);
    return {
      title: `${num(g.count)} × ${g.name} · ${where}`,
      swatch: creepColor(g.creep),
      tags: creepTagList(spec, last),
      facts: [
        ...creepFacts(spec, g.hp),
        ['Leak', maul.endsRun(g.creep, n, MAUL_WAVES.length) ? 'the Run' : plural(g.lives, 'life', 'lives')],
        ['Bounty', `${cents(Math.round(g.hp * rate) / 100)} gold each`],
      ],
      lines: creepLines(spec),
      ranks: [best.attacks, best.lines],
    };
  });
  const first = w.groups[0]!;
  return {
    id: `wave-${n}`,
    lead: String(n),
    title: w.groups.map((g) => `${num(g.count)} ${g.name}`).join(', '),
    summary: `${num(first.hp)} HP`,
    tags,
    sections: [wave, ...sections],
  };
}

function waves(values: ReferenceValues): ReferenceTab {
  const p = pickOf(values);
  const rows: ReferenceRow[] = [];
  for (let n = 1; n <= MAUL_WAVES.length; n++) {
    const row = waveRow(p, n);
    if (row) rows.push(row);
  }
  return {
    intro: [
      { text: `${num(START_GOLD)} gold` },
      { text: plural(START_LIVES, 'life', 'lives') },
      { text: `Breaks ${num(BREAK_SECONDS)} s`, about: `${num(FIRST_BREAK_SECONDS)} s before Wave 1; Send now ends a Break and pays nothing` },
      { text: `Interest ${pct(INTEREST_RATE)}`, about: 'On unspent gold at each clear, up to the Wave bonus' },
      { text: `Air ${AIR_WAVES.join(', ')}`, tone: 'air', about: 'Harpy Waves fly straight over the maze' },
      { text: `Bosses ${BOSS_WAVES.join(', ')}`, tone: 'boss', about: 'A boss from each Gate, with an escort behind it' },
    ],
    groups: [{ id: 'waves', rows }],
  };
}

// --- The Towers tab ----------------------------------------------------------------

/** Maul's tower rules: 75% back on a sale, all of it for what was spent this Break, and a second Race after Wave 15. */
export const MAUL_TOWER_RULES: TowerRules = {
  creeps: MAUL_CREEPS,
  sells: (total) => `${num(maul.saleValue(total, 0))} gold (${pct(SELL_SHARE)}) · ${num(maul.saleValue(total, total))} if bought this Break`,
  wallLines: [`Once a second Race joins, after Wave ${SECOND_RACE_AFTER} is cleared, any Wall can also become its two Tier 1 towers`],
  raceFacts: () => [['Second Race', `joins after Wave ${SECOND_RACE_AFTER}, free`]],
};

function towers(values: ReferenceValues): ReferenceTab {
  const p = pickOf(values);
  const wall = tower(RACE_SPECS[RACES[0]].builds[0]).maul.total;
  return {
    intro: [
      { text: `Walls ${num(wall)} gold` },
      { text: `Sells ${pct(SELL_SHARE)}`, about: 'Gold spent during the current Break comes back in full until the next Wave starts' },
      { text: `Second Race after Wave ${SECOND_RACE_AFTER}` },
      { text: 'Slows don\'t stack', about: 'Every slow shares one key: only the strongest on a creep counts' },
    ],
    note: DPS_NOTE,
    groups: raceGroups(p.races, MAUL_TOWER_RULES),
  };
}

export const MAUL_REFERENCE: ModeReference = {
  defaults,
  filters,
  waves,
  towers,
  current(view) {
    const st = maul.maulStatus(view.state);
    if (st.step === 'over') return { now: null, next: null };
    // Between Waves, Now is the Wave the Break counts down to (Wave 1 before the first).
    const n = st.break ? st.break.wave : Math.max(1, st.wave);
    return { now: `wave-${n}`, next: n < st.total ? `wave-${n + 1}` : null };
  },
};

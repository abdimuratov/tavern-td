import {
  ARMOR_TYPES, BOSS_SLOW_SHARE, BREAK_SECONDS, CHALLENGE_DIFFICULTY, DAMAGE_TABLE, DAMAGE_TYPES, FAMILIES, FAMILY_BASE, LEVEL_AURA,
  LEVEL_DAMAGE, MAX_LEVEL, ORIGINAL_CREEPS, ORIGINAL_TOWERS, PERK_LEVELS, PERKS, STAGES, START_LIVES, UNLOCKS, challengeOfStage, stageByNumber,
  type ArmorType, type ChallengeModifiers, type ChallengeSpec, type DamageType, type Family, type OriginalCreepSpec, type OriginalTowerSpec,
  type StageSpec,
} from '../../../content/original';
import { DIFFICULTIES, original, routeCount, type Difficulty } from '../../../sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../../catalog';
import { num } from '../../format';
import { armorProfile, rankCounters, type CounterCandidate, type CounterEdge, type CounterTarget } from '../../reference/counters';
import type {
  ModeReference, ReferenceContext, ReferenceFilter, ReferenceGroup, ReferenceRank, ReferenceRow, ReferenceSection, ReferenceTab,
  ReferenceTag, ReferenceValues,
} from '../../reference/types';
import { creepColor, FAMILY_COLOR } from './look';
import {
  abilityLines, ARMOR_NAME, creepTags, creepTraitLines, DAMAGE_NAME, FAMILY_NAME, pct, rate, secs, TARGETING_NAME, tierName,
} from './text';

// The Original's Waves & Towers sheet (ModeUi.reference): every Stage's Waves
// with their creeps and Best against, and every tower of the six Tower
// Families. Every number comes from the content tables and the sim's queries;
// the words are the role lines and labels of text.ts.

/** The filter values, as the sheet holds them. */
export interface OriginalPick {
  readonly stage: StageSpec;
  /** The Stage's Challenge when the toggle is on. */
  readonly challenge: ChallengeSpec | null;
  /** The Difficulty its numbers are at: a Challenge always plays Normal. */
  readonly difficulty: Difficulty;
}

const isDifficulty = (v: string | undefined): v is Difficulty => (DIFFICULTIES as readonly string[]).includes(v ?? '');

/** The Stage, Challenge and Difficulty these values show. */
export function pickOf(values: ReferenceValues): OriginalPick {
  const stage = stageByNumber(Number(values['stage'])) ?? STAGES[0]!;
  const challenge = values['challenge'] === '1' ? challengeOfStage(stage.number) ?? null : null;
  const d = values['difficulty'];
  return { stage, challenge, difficulty: challenge ? CHALLENGE_DIFFICULTY : isDifficulty(d) ? d : 'normal' };
}

const NO_MODS: ChallengeModifiers = {};
const modsOf = (p: OriginalPick): ChallengeModifiers => p.challenge?.modifiers ?? NO_MODS;
const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Gold to the hundredth, as a bounty is split: "14.29", "8.5", "3". */
const cents = (n: number): string => (Number.isInteger(n) ? num(n) : n.toFixed(2).replace(/0$/, ''));

// --- What hits what ------------------------------------------------------------

const TOWERS = Object.entries(ORIGINAL_TOWERS);

function hitsAir(spec: OriginalTowerSpec): boolean {
  return spec.attack !== undefined && spec.attack.targets !== 'ground';
}

/** A family's towers in upgrade order: Tiers 1–3, then both Specialisations. */
export function familyLine(family: Family): string[] {
  const line: string[] = [];
  let next: readonly string[] = [FAMILY_BASE[family]];
  while (next.length > 0) {
    line.push(...next);
    next = next.length === 1 ? ORIGINAL_TOWERS[next[0]!]!.original.next : [];
  }
  return line;
}

/** Towers of Tiers 1–3: what a family is before it specialises. */
const baseTowers = (family: Family): OriginalTowerSpec[] => familyLine(family).map((id) => ORIGINAL_TOWERS[id]!).filter((t) => t.original.tier <= 3);

/** The damage type a family's Tiers 1–3 deal, or null for one that doesn't attack (Totem). */
function familyDamage(family: Family): DamageType | null {
  return baseTowers(family)[0]?.original.damageType ?? null;
}

interface DamageCandidate extends CounterCandidate {
  readonly type: DamageType;
  /** Names of the towers of this type that hit air, when only some do. */
  readonly airOnly: readonly string[];
}

/** Each damage type, hitting air when any of its towers does. */
const DAMAGE_CANDIDATES: readonly DamageCandidate[] = DAMAGE_TYPES.map((type) => {
  const of = TOWERS.map(([, t]) => t).filter((t) => t.attack && t.original.damageType === type);
  const air = of.filter(hitsAir);
  return { id: type, type, damage: type, hitsAir: air.length > 0, airOnly: air.length < of.length ? air.map((t) => t.name) : [] };
});

interface FamilyCandidate extends CounterCandidate {
  readonly family: Family;
  /** Specialisations that hit air though the family's Tiers 1–3 don't (Flak Battery). */
  readonly airSpecs: readonly string[];
}

/** The families that attack, hitting air when all of Tiers 1–3 do. */
const FAMILY_CANDIDATES: readonly FamilyCandidate[] = FAMILIES.flatMap((family): FamilyCandidate[] => {
  const damage = familyDamage(family);
  if (!damage) return [];
  const air = baseTowers(family).every(hitsAir);
  const airSpecs = air ? [] : familyLine(family).map((id) => ORIGINAL_TOWERS[id]!).filter((t) => t.original.tier === 4 && hitsAir(t)).map((t) => t.name);
  return [{ id: family, family, damage, hitsAir: air, airSpecs }];
});

const share = (damage: string, armor: string): number => DAMAGE_TABLE[damage as DamageType][armor as ArmorType];

/** Whether a creep has a Shield at any point: its own, or a boss's raised one (the Riftlord's). */
function shielded(spec: OriginalCreepSpec): boolean {
  return (spec.original.shield ?? 0) > 0 || spec.original.boss?.kind === 'rift';
}

const isFast = (spec: OriginalCreepSpec): boolean => creepTags(spec).includes('Fast');

const POISON_SHIELD = 'poison over time ignores its Shield';

/** The rules beyond the table, for a family against a creep. */
function familyEdges(spec: OriginalCreepSpec, family: Family): CounterEdge[] {
  const edges: CounterEdge[] = [];
  const base = ORIGINAL_TOWERS[FAMILY_BASE[family]]!.original;
  if (family === 'poison' && shielded(spec)) edges.push({ edge: 1, why: POISON_SHIELD });
  if (spec.armorType === 'boss' && base.slow) edges.push({ edge: -1, why: `bosses take slows at ${pct(BOSS_SLOW_SHARE)} and ignore freezes` });
  else if (isFast(spec) && base.slow) edges.push({ edge: 1, why: 'its slows hold it back' });
  if (spec.original.role === 'swarm' && base.splash) edges.push({ edge: 1, why: 'splash hits several at once' });
  return edges;
}

export interface BestAgainst {
  readonly damage: ReferenceRank;
  readonly families: ReferenceRank;
}

/** Best against for one creep: damage types by the damage table, then the families that can hit it. */
export function bestAgainst(creep: string): BestAgainst {
  const spec = ORIGINAL_CREEPS[creep];
  if (!spec) return { damage: { label: 'Best against', items: [] }, families: { label: 'Families', items: [] } };
  const target: CounterTarget = { armor: spec.armorType, air: spec.flying };
  const types = rankCounters(target, DAMAGE_CANDIDATES, {
    share,
    edges: (c) => (c.type === 'poison' && shielded(spec) ? [{ edge: 1, why: POISON_SHIELD }] : []),
  });
  const fams = rankCounters(target, FAMILY_CANDIDATES, { share, edges: (c) => familyEdges(spec, c.family) });
  const damage: ReferenceRank = {
    label: 'Best against',
    items: types.ranked.map((r) => {
      const why = [...r.why, ...(spec.flying && r.candidate.airOnly.length > 0 ? [`only ${r.candidate.airOnly.join(' and ')} hits air`] : [])];
      return { text: DAMAGE_NAME[r.candidate.type], value: pct(r.share), rank: r.rank, ...(why.length > 0 ? { why } : {}) };
    }),
    ...(types.cannot.length > 0 ? { note: `Can't hit air: ${types.cannot.map((c) => DAMAGE_NAME[c.type]).join(', ')}` } : {}),
  };
  const families: ReferenceRank = {
    label: 'Families',
    items: fams.ranked.map((r) => {
      const why = [...r.why];
      // Deadeye Perch, the Arrow Specialisation, hits Armored creeps as if they were Unarmored.
      const piercing = familyLine(r.candidate.family).map((id) => ORIGINAL_TOWERS[id]!).filter((t) => t.original.ignoresArmored);
      if (spec.armorType === 'armored' && piercing.length > 0) why.push(`${piercing.map((t) => t.name).join(' and ')} hits it as ${ARMOR_NAME.unarmored}`);
      return { text: FAMILY_NAME[r.candidate.family], value: pct(r.share), rank: r.rank, ...(why.length > 0 ? { why } : {}) };
    }),
    ...(fams.cannot.length > 0 ? {
      note: `Can't hit air: ${fams.cannot.map((c) => (c.airSpecs.length > 0 ? `${FAMILY_NAME[c.family]} (${c.airSpecs.join(', ')} can)` : FAMILY_NAME[c.family])).join(', ')}`,
    } : {}),
  };
  return { damage, families };
}

// --- The filters ---------------------------------------------------------------

function defaults(ctx: ReferenceContext): ReferenceValues {
  if (ctx.view) {
    const st = original.originalStatus(ctx.view.state);
    return { stage: String(st.stage), challenge: st.challenge ? '1' : '0', difficulty: st.difficulty };
  }
  const from = ctx.from ?? {};
  return { stage: from['stage'] ?? '1', challenge: from['challenge'] ?? '0', difficulty: from['difficulty'] ?? 'normal' };
}

function filters(values: ReferenceValues, ctx: ReferenceContext): ReferenceFilter[] {
  const p = pickOf(values);
  const challenge = challengeOfStage(p.stage.number);
  const out: ReferenceFilter[] = [{
    id: 'stage', label: 'Stage', kind: 'select', value: String(p.stage.number),
    choices: STAGES.map((s) => ({ id: String(s.number), label: `${s.number} · ${s.name}`, about: s.line })),
  }];
  if (challenge) {
    out.push({
      id: 'challenge', label: `Challenge: ${challenge.name}`, short: 'Challenge', kind: 'toggle', value: p.challenge ? '1' : '0',
      choices: [{ id: '0', label: 'Off' }, { id: '1', label: 'On', about: `${challenge.name}: ${challenge.rule}` }],
    });
  }
  const locked = p.challenge ? `Challenges play ${DIFFICULTY_NAME[CHALLENGE_DIFFICULTY]}` : ctx.view ? 'Fixed for this Run' : undefined;
  out.push({
    id: 'difficulty', label: 'Difficulty', kind: 'seg', value: p.difficulty, tabs: ['waves'],
    choices: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_NAME[d], about: difficultyAbout('original', d) })),
    ...(locked ? { locked } : {}),
  });
  return out;
}

// --- The Waves tab -------------------------------------------------------------

/** A Challenge's modifiers as chips, in the order its rule reads. */
export function modifierTags(mods: ChallengeModifiers): ReferenceTag[] {
  const tags: ReferenceTag[] = [];
  const bad = (text: string, about?: string): void => void tags.push({ text, tone: 'bad', ...(about ? { about } : {}) });
  if (mods.families) bad(`Only ${mods.families.map((f) => FAMILY_NAME[f]).join(', ')}`);
  if (mods.hp !== undefined) bad(`Creeps ${mods.hp >= 1 ? '+' : '−'}${pct(Math.abs(mods.hp - 1))} HP`);
  if (mods.lives !== undefined) bad(plural(mods.lives, 'life', 'lives'));
  if (mods.gold !== undefined) bad(`${num(mods.gold)} gold`);
  if (mods.breakSeconds !== undefined) bad(`Breaks ${secs(mods.breakSeconds)}`);
  if (mods.maxTier !== undefined) bad(`Tier ${mods.maxTier} at most`);
  if (mods.noSpecialisations) bad('No Specialisations');
  if (mods.burnt) bad(`Burnt ground: ${mods.burnt.name}`);
  if (mods.maxTowers !== undefined) bad(`Tower cap ${mods.maxTowers}`);
  if (mods.noEarlyCall) bad('Send now pays no gold');
  return tags;
}

/** The Stage's numbers as chips: Waves, Threat, gold, lives and Breaks, with what the Challenge changes. */
function stageTags(p: OriginalPick): ReferenceTag[] {
  const s = p.stage;
  const mods = modsOf(p);
  const tags: ReferenceTag[] = [
    { text: plural(s.waves.length, 'Wave') },
    { text: `Threat ${s.threat}–${s.threat + s.waves.length - 1}`, about: 'Threat sets each Wave\'s HP, bounty and bonus' },
  ];
  const routes = routeCount(s.map);
  if (routes > 1) tags.push({ text: plural(routes, 'route') });
  if (mods.gold === undefined) tags.push({ text: `${num(s.gold)} gold` });
  if (mods.lives === undefined) tags.push({ text: plural(START_LIVES, 'life', 'lives') });
  if (mods.breakSeconds === undefined) tags.push({ text: `Breaks ${secs(BREAK_SECONDS)}` });
  return [...tags, ...modifierTags(mods)];
}

interface CreepCount {
  readonly creep: string;
  readonly count: number;
}

/** A Wave's creeps by kind, in the order they first come. */
function countsOf(groups: readonly CreepCount[]): CreepCount[] {
  const out: { creep: string; count: number }[] = [];
  for (const g of groups) {
    const known = out.find((c) => c.creep === g.creep);
    if (known) known.count += g.count;
    else out.push({ creep: g.creep, count: g.count });
  }
  return out;
}

/** A creep's tags: the wave preview's, then Air, Boss and Swarm. */
export function creepTagList(spec: OriginalCreepSpec): ReferenceTag[] {
  const tags: ReferenceTag[] = creepTags(spec).map((text) => ({ text, tone: 'trait' }));
  if (spec.flying) tags.push({ text: 'Air', tone: 'air' });
  if (spec.original.boss) tags.push({ text: 'Boss', tone: 'boss' });
  if (spec.original.role === 'swarm') tags.push({ text: 'Swarm', tone: 'trait' });
  return tags;
}

/** One group of a Wave: its creep, how many and where, its numbers at this Threat and Difficulty, and Best against. */
function groupSection(g: original.WavePreview['groups'][number], threat: number, scale: number, routes: number): ReferenceSection {
  const spec = ORIGINAL_CREEPS[g.creep]!;
  const i = spec.original;
  const where = [routes > 1 ? `Route ${g.route + 1}` : '', g.at > 0 ? `from ${secs(g.at)}` : ''].filter(Boolean);
  const facts: [string, string][] = [
    ['HP', num(g.hp)],
    ['Armor', ARMOR_NAME[spec.armorType]],
    ['Speed', num(spec.speed)],
    ['Role', cap(i.role)],
  ];
  if (i.shield) facts.push(['Shield', `${num(original.shieldAt(i.shield, threat, scale))} a hit`]);
  if (i.boss?.kind === 'rift') facts.push(['Shield', `${num(original.shieldAt(i.boss.shield, threat, scale))} a hit for ${secs(i.boss.duration)}`]);
  facts.push(['Bounty', g.bounty > 0 ? `${cents(g.bounty)} gold each` : 'none']);
  facts.push(['Leak', plural(i.lives, 'life', 'lives')]);
  const best = bestAgainst(g.creep);
  return {
    title: `${num(g.count)} × ${g.name}${where.length > 0 ? ` · ${where.join(' · ')}` : ''}`,
    swatch: creepColor(g.creep),
    tags: creepTagList(spec),
    facts,
    lines: creepTraitLines(spec).map(cap),
    ranks: [best.damage, best.families],
  };
}

/** Wave `n` of the pick as a row: its creeps in one line, and each group in full. */
function waveRow(p: OriginalPick, n: number): ReferenceRow | null {
  const scale = original.hpScaleFor(p.difficulty, modsOf(p));
  const w = original.previewWave(p.stage.waves, n, p.stage.threat, scale);
  if (!w) return null;
  const routes = routeCount(p.stage.map);
  const counts = countsOf(w.groups);
  const tags: ReferenceTag[] = [];
  for (const c of counts) {
    for (const t of creepTagList(ORIGINAL_CREEPS[c.creep]!)) if (!tags.some((x) => x.text === t.text)) tags.push(t);
  }
  const wave: ReferenceSection = {
    facts: [
      ['Threat', String(w.threat)],
      ['Creeps', num(w.groups.reduce((sum, g) => sum + g.count, 0))],
      ['Bounty pool', `${num(original.bountyPool(w.threat))} gold`],
      ['Wave bonus', `${num(w.bonus)} gold`],
      ['Ghoul HP', num(w.ghoulHp)],
    ],
  };
  return {
    id: `wave-${n}`,
    lead: String(n),
    title: counts.map((c) => `${num(c.count)} ${ORIGINAL_CREEPS[c.creep]!.name}`).join(', '),
    summary: `Threat ${w.threat}`,
    tags,
    sections: [wave, ...w.groups.map((g) => groupSection(g, w.threat, scale, routes))],
  };
}

function waves(values: ReferenceValues): ReferenceTab {
  const p = pickOf(values);
  const rows: ReferenceRow[] = [];
  for (let n = 1; n <= p.stage.waves.length; n++) {
    const row = waveRow(p, n);
    if (row) rows.push(row);
  }
  return {
    intro: stageTags(p),
    ...(p.challenge ? { note: `${p.challenge.name}: ${p.challenge.rule}` } : {}),
    groups: [{ id: `stage-${p.stage.number}`, rows }],
  };
}

// --- The Towers tab ------------------------------------------------------------

/** The Stage whose win opens a family (0: open from the start), or of the first step setting `key`. */
function opensAfter(test: (step: (typeof UNLOCKS)[number]) => boolean): number {
  return UNLOCKS.find(test)?.after ?? 0;
}

/** When a step opens in the Campaign: "From the start", or "Win Stage 2". */
function opensText(after: number): string {
  return after === 0 ? 'From the start' : `Win Stage ${after}`;
}

const TIER3_AFTER = opensAfter((s) => s.tier3 === true);
const SPECS_AFTER = opensAfter((s) => s.specialisations === true);

/** When a tower's step opens in the Campaign: its family, Tier 3, or Specialisations. */
function towerOpens(spec: OriginalTowerSpec): number {
  const family = opensAfter((s) => s.families?.includes(spec.original.family) === true);
  const step = spec.original.tier === 4 ? SPECS_AFTER : spec.original.tier === 3 ? TIER3_AFTER : 0;
  return Math.max(family, step);
}

/** Why the Challenge shown keeps a tower or family out, or null. */
function challengeBars(p: OriginalPick, family: Family, tier?: number): string | null {
  const c = p.challenge;
  if (!c) return null;
  const m = c.modifiers;
  if (m.families && !m.families.includes(family)) return `Not allowed in ${c.name}`;
  if (tier !== undefined && m.maxTier !== undefined && tier > m.maxTier) return `${c.name} stops at Tier ${m.maxTier}`;
  if (tier === 4 && m.noSpecialisations) return `No Specialisations in ${c.name}`;
  return null;
}

/** The creeps of an armor type, by name. */
function creepsOf(armor: string): string[] {
  return Object.values(ORIGINAL_CREEPS).filter((c) => c.armorType === armor).map((c) => c.name);
}

/** Strong against / Weak against for a damage type, with Armored treated as Unarmored for a tower that pierces it, and air. */
export function strengths(type: DamageType, air: boolean, ignoresArmored = false): ReferenceSection[] {
  const shareOf = (d: string, a: string): number => share(d, ignoresArmored && a === 'armored' ? 'unarmored' : a);
  const prof = armorProfile(type, ARMOR_TYPES, shareOf);
  const tag = (armor: string, s: number, tone: 'good' | 'bad'): ReferenceTag => ({
    text: `${ARMOR_NAME[armor as ArmorType]} ${pct(s)}`, tone, about: creepsOf(armor).join(', '),
  });
  const strong = prof.even
    ? [{ text: `Every armor ${pct(shareOf(type, ARMOR_TYPES[0]))}`, tone: 'good' as const }]
    : prof.strong.map((r) => tag(r.armor, r.share, 'good'));
  const weak = prof.weak.map((r) => tag(r.armor, r.share, 'bad'));
  if (!air) weak.push({ text: 'Air', tone: 'bad', about: Object.values(ORIGINAL_CREEPS).filter((c) => c.flying).map((c) => c.name).join(', ') });
  const named = (rows: readonly { armor: string }[]): string[] => rows.map((r) => `${ARMOR_NAME[r.armor as ArmorType]}: ${creepsOf(r.armor).join(', ')}`);
  return [
    { title: 'Strong against', tags: strong, ...(prof.even ? {} : { lines: named(prof.strong) }) },
    { title: 'Weak against', tags: weak.length > 0 ? weak : [{ text: 'Nothing', tone: 'good' }], ...(prof.weak.length > 0 ? { lines: named(prof.weak) } : {}) },
  ];
}

function hitsText(spec: OriginalTowerSpec): string {
  if (!spec.attack) return 'Doesn\'t attack';
  return spec.attack.targets === 'both' ? 'Ground and air' : spec.attack.targets === 'air' ? 'Air only' : 'Ground only';
}

/** A tower's hit in a few words: "6 Pierce", or the beam's "40/s Magic". */
function hitText(spec: OriginalTowerSpec): string {
  const atk = spec.attack;
  const type = spec.original.damageType;
  if (!atk || !type) return '';
  const dmg = spec.original.beam ? `${num(Math.round(atk.damage[0] / atk.cooldown))}/s` : num(atk.damage[0]);
  return `${dmg} ${DAMAGE_NAME[type]}`;
}

function towerRow(p: OriginalPick, id: string): ReferenceRow {
  const spec = ORIGINAL_TOWERS[id]!;
  const i = spec.original;
  const atk = spec.attack;
  const facts: [string, string][] = [[i.tier === 1 ? 'Build' : 'Upgrade', `${num(i.price)} gold`], ['Total', `${num(i.total)} gold`]];
  if (atk && i.damageType) {
    facts.push(['Damage', spec.original.beam ? `${num(Math.round(atk.damage[0] / atk.cooldown))}/s, ramping` : num(atk.damage[0])]);
    facts.push(['Type', DAMAGE_NAME[i.damageType]]);
    if (!i.beam) facts.push(['Speed', rate(atk.cooldown)]);
    facts.push(['Range', num(atk.range)]);
    if (i.minRange) facts.push(['Min range', num(i.minRange)]);
    facts.push(['Aim', TARGETING_NAME[i.targeting]]);
  }
  facts.push(['Hits', hitsText(spec)]);
  if (i.auras?.radius) facts.push(['Aura', num(i.auras.radius)]);
  const next = i.next.map((n) => ORIGINAL_TOWERS[n]!);
  if (next.length > 0) facts.push(['Upgrades to', `${next.map((t) => t.name).join(' or ')} · ${num(next[0]!.original.price)} gold`]);
  facts.push(['Opens', opensText(towerOpens(spec))]);
  const off = challengeBars(p, i.family, i.tier);
  const air = hitsAir(spec);
  const summary = atk ? [hitText(spec), i.beam ? '' : rate(atk.cooldown), `range ${num(atk.range)}`] : [abilityLines(spec)[0] ?? ''];
  return {
    id: `tower-${id}`,
    lead: i.tier >= 4 ? 'Spec' : `T${i.tier}`,
    title: spec.name,
    summary: [`${num(i.price)} gold`, ...summary].filter(Boolean).join(' · '),
    swatch: FAMILY_COLOR[i.family],
    tags: air ? [{ text: 'Air', tone: 'air', about: 'Hits flying creeps too' }] : [],
    ...(off ? { off } : {}),
    sections: [
      { title: `${tierName(i.tier)}`, facts, lines: abilityLines(spec) },
      ...(atk && i.damageType ? strengths(i.damageType, air, i.ignoresArmored === true) : []),
    ],
  };
}

function familyHead(p: OriginalPick, family: Family): ReferenceRow {
  const line = familyLine(family).map((id) => ORIGINAL_TOWERS[id]!);
  const tiers = line.filter((t) => t.original.tier <= 3);
  const specs = line.filter((t) => t.original.tier === 4);
  const damage = familyDamage(family);
  const air = tiers.every(hitsAir);
  const opens = opensAfter((s) => s.families?.includes(family) === true);
  const perks = PERKS[family];
  const levelBonus = damage
    ? `Each Tower Level above 1: +${pct(LEVEL_DAMAGE)} damage, up to Level ${MAX_LEVEL}`
    : `Each Tower Level above 1: +${num(Math.round(LEVEL_AURA * 100))} point to its auras, up to Level ${MAX_LEVEL}`;
  const off = challengeBars(p, family);
  return {
    id: `family-${family}`,
    title: FAMILY_NAME[family],
    summary: [damage ? DAMAGE_NAME[damage] : 'Auras', damage ? (air ? 'ground and air' : 'ground only') : '', opensText(opens)].filter(Boolean).join(' · '),
    swatch: FAMILY_COLOR[family],
    tags: damage && air ? [{ text: 'Air', tone: 'air', about: 'Tiers 1–3 hit flying creeps too' }] : [],
    ...(off ? { off } : {}),
    sections: [
      {
        title: 'Upgrade path',
        facts: [
          ['Type', damage ? DAMAGE_NAME[damage] : 'No attack'],
          ['Hits', damage ? (air ? 'Ground and air' : 'Ground only') : hitsText(tiers[0]!)],
          ['Opens', opensText(opens)],
          ['Tier 3', opensText(Math.max(opens, TIER3_AFTER))],
          ['Specialisations', opensText(Math.max(opens, SPECS_AFTER))],
        ],
        lines: [`${tiers.map((t) => t.name).join(' → ')}, then ${specs.map((t) => t.name).join(' or ')}`],
      },
      {
        title: 'Tower Levels',
        lines: [levelBonus, ...PERK_LEVELS.map((lv, k) => `Level ${lv}: ${perks[k]!.name}, ${perks[k]!.text.charAt(0).toLowerCase()}${perks[k]!.text.slice(1)}`)],
      },
      ...(damage ? strengths(damage, air) : []),
    ],
  };
}

function towers(values: ReferenceValues): ReferenceTab {
  const p = pickOf(values);
  const groups: ReferenceGroup[] = FAMILIES.map((family) => ({
    id: `family-${family}`,
    head: familyHead(p, family),
    rows: familyLine(family).map((id) => towerRow(p, id)),
  }));
  return {
    ...(p.challenge ? { intro: modifierTags(p.challenge.modifiers), note: `${p.challenge.name}: ${p.challenge.rule}` } : {}),
    groups,
  };
}

export const ORIGINAL_REFERENCE: ModeReference = {
  defaults,
  filters,
  waves,
  towers,
  current(view, values) {
    const st = original.originalStatus(view.state);
    if (Number(values['stage']) !== st.stage || st.step === 'over') return { now: null, next: null };
    const n = view.state.wave.number;
    return { now: n >= 1 ? `wave-${n}` : null, next: n < view.state.wave.total ? `wave-${n + 1}` : null };
  },
};

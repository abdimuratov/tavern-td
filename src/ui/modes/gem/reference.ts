import {
  ARMOR_TYPES, BASE_SLATES, BOSS, COMBO_SLATES, EXTRA_CHANCE, EXTRA_CHANCE_QUALITY, FROST, GEM_CREEPS, GEM_DAMAGE_TABLE,
  GEM_TYPES, GEM_WAVES, MAX_QUALITY, QUALITIES, QUALITY_COST, QUALITY_WEIGHTS, SLATE_PUSH, SLATE_STACKING_RADIUS,
  SPECIAL_LINES, SPELL_ATTACK_TYPE, STONE_OF_BRYVX, WAVE_COUNT, gemId, qualityName, typeName,
  type ArmorType, type GemCreepSpec, type GemKillCritEffect, type GemLightningEffect, type GemShadowStrikeEffect,
  type GemGrabEffect, type GemSpell, type GemSpellsEffect, type GemStrikeEffect, type GemTowerSpec, type GemType, type Quality,
  type SpecialLine,
} from '../../../content/gem';
import {
  DEFAULT_ARMOR_FACTOR, DIFFICULTIES, armorMultiplier, gem, typeMultiplier, waveGroupNumbers,
  type Difficulty, type TargetLayer, type WaveGroup, type WaveSpec,
} from '../../../sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../../catalog';
import { armorProfile, rankCounters, type CounterCandidate, type CounterEdge, type CounterTarget } from '../../reference/counters';
import type {
  ModeReference, ReferenceContext, ReferenceFilter, ReferenceGroup, ReferenceRank, ReferenceRankItem, ReferenceRow, ReferenceSection,
  ReferenceTab, ReferenceTag, ReferenceValues,
} from '../../reference/types';
import { GEM_LOOK, TYPE_COLOR } from './look';
import { abilities, ARMOR_NAME, ATTACK_NAME, damageText, num, pct, rate, specName, specOf } from './text';

// Gem's Waves & Towers sheet (ModeUi.reference): the 50 Waves and the Damage
// Test with Best against by gem type and by Special, and every structure:
// the 8 gem types at each quality, the 13 Recipes and their Tiers, the Stone
// of Bryvx, the Slates, and Gem Quality's odds with Extra Chance. Every
// number comes from the content tables and the sim's queries; the words are
// text.ts's and short role lines.

const plural = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;
const either = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)!}`);
const both = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);
const plus = (xs: readonly string[]): string => xs.join(' + ');
const secs = (s: number): string => `${num(s)} s`;

/** The Gem damage table's share; spell damage reads its Spells row. */
export function share(damage: string, armor: string): number {
  return typeMultiplier(GEM_DAMAGE_TABLE, damage, armor);
}

const ARMOR_FACTOR = gem.GEM_RULES.armorFactor ?? DEFAULT_ARMOR_FACTOR;
/** The Kill Step's top, 11. */
const TOP_STEP = gem.killStep(Number.MAX_SAFE_INTEGER);
const spec = (id: string): GemTowerSpec => specOf(id)!;

// --- What a structure hits with ---------------------------------------------------

type Layer = TargetLayer;

/** A slate's grab, strike or Shadow Strike: what its every-0.05 s attack really does. */
function triggerOf(s: GemTowerSpec): GemGrabEffect | GemStrikeEffect | GemShadowStrikeEffect | null {
  const e = (s.attack?.effects ?? []).find((x) => x.kind === 'gem.grab' || x.kind === 'gem.strike' || x.kind === 'gem.shadowStrike');
  return (e as GemGrabEffect | GemStrikeEffect | GemShadowStrikeEffect | undefined) ?? null;
}

/** Its spell damage, which reads the Spells row and skips armor: burns, poison, marks, novas, lightning, Shadow Strike, slate spells. */
const SPELL_DAMAGE: Readonly<Record<string, string>> = {
  'gem.poison': 'poison', 'gem.fireMark': 'mark', 'gem.nova': 'Frost Nova', 'gem.lightning': 'lightning',
  'gem.shadowStrike': 'Shadow Strike', 'gem.spells': 'spells',
};

function spellDamageOf(s: GemTowerSpec): string | null {
  if (s.gem.burn) return 'burn';
  for (const e of s.attack?.effects ?? []) if (SPELL_DAMAGE[e.kind]) return SPELL_DAMAGE[e.kind]!;
  return null;
}

/** Its main damage type: a slate's grab or strike, the attack's when it deals damage, else the Spells row of its spell damage; null for none. */
function hitTypeOf(s: GemTowerSpec): string | null {
  const t = triggerOf(s);
  if (t) return t.kind === 'gem.shadowStrike' ? SPELL_ATTACK_TYPE : t.attackType;
  if (s.attack && s.attack.damage[1] > 0) return s.attack.attackType;
  return spellDamageOf(s) !== null ? SPELL_ATTACK_TYPE : null;
}

/** Where its damage lands: the attack's layer; a burn reaches both. */
function layerOf(s: GemTowerSpec): Layer | null {
  return s.gem.burn ? 'both' : s.attack?.targets ?? null;
}

const reaches = (layer: Layer, flying: boolean): boolean => (flying ? layer !== 'ground' : layer !== 'air');
const hitsText = (layer: Layer): string => (layer === 'both' ? 'Ground and air' : layer === 'ground' ? 'Ground only' : 'Air only');

// --- Best against ------------------------------------------------------------------

interface HitCandidate extends CounterCandidate {
  readonly name: string;
  /** Its spell damage, which skips armor, or null. */
  readonly spell: string | null;
  /** Later Tiers that reach the layer its first Tier can't. */
  readonly laterReach: readonly string[];
}

function candidate(id: string, name: string, s: GemTowerSpec, later: readonly string[] = []): HitCandidate {
  const layer = layerOf(s)!;
  return {
    id, name, damage: hitTypeOf(s)!, hitsAir: layer !== 'ground', hitsGround: layer !== 'air', spell: spellDamageOf(s),
    laterReach: later.filter((t) => layerOf(spec(t)) === 'both' && layer !== 'both').map(specName),
  };
}

/** Each gem type by its attack type: the same at every quality. */
const TYPE_CANDIDATES: readonly HitCandidate[] = GEM_TYPES.map((type) => candidate(type, typeName(type), spec(gemId(type, QUALITIES[0]))));

/** Each Recipe's Special by its first Tier: the type and layer it starts with. */
const SPECIAL_CANDIDATES: readonly HitCandidate[] = SPECIAL_LINES.map((line) => candidate(line.id, line.name, spec(line.tiers[0]!), line.tiers.slice(1)));

const withWhy = (item: Omit<ReferenceRankItem, 'why'>, why: readonly string[]): ReferenceRankItem =>
  (why.length > 0 ? { ...item, why } : item);

/** Best against by `candidates`: the damage table first, then spell damage, which skips the creep's armor. */
function rankAgainst(creep: GemCreepSpec, label: string, candidates: readonly HitCandidate[]): ReferenceRank {
  const target: CounterTarget = { armor: creep.armorType, air: creep.flying };
  const edges = (c: HitCandidate): CounterEdge[] =>
    (c.spell && creep.armor > 0 ? [{ edge: 1, why: `its ${c.spell} ${c.spell === 'spells' ? 'skip' : 'skips'} its ${num(creep.armor)} armor` }] : []);
  const ranked = rankCounters(target, candidates, { share, edges });
  const cannot = ranked.cannot.map((c) => (c.laterReach.length > 0 ? `${c.name} (${both(c.laterReach)} can)` : c.name));
  return {
    label,
    items: ranked.ranked.map((r) => withWhy({ text: r.candidate.name, value: pct(r.share), rank: r.rank }, r.why)),
    ...(cannot.length > 0 ? { note: `Can't hit ${target.air ? 'air' : 'ground'}: ${cannot.join(', ')}` } : {}),
  };
}

export interface BestAgainst {
  /** The 8 gem types by Gem's damage table. */
  readonly types: ReferenceRank;
  /** The 13 Specials by their first Tier. */
  readonly specials: ReferenceRank;
}

/** Best against for one creep: the gem types by the damage table, then the Specials; what can't reach its layer drops out. */
export function bestAgainst(creep: GemCreepSpec): BestAgainst {
  return { types: rankAgainst(creep, 'Best against', TYPE_CANDIDATES), specials: rankAgainst(creep, 'Specials', SPECIAL_CANDIDATES) };
}

// --- Creeps and Waves ----------------------------------------------------------------

/** A creep's colour on the board. */
export function creepColor(id: string): number {
  const s = GEM_CREEPS[id];
  return s ? GEM_LOOK.creep(id, s).color : 0xcccccc;
}

/** Air, the Damage Test, and the armor type that decides Best against. */
export function creepTags(id: string, creep: GemCreepSpec): ReferenceTag[] {
  const tags: ReferenceTag[] = [];
  if (creep.flying) tags.push({ text: 'Air', tone: 'air', about: 'Flies straight from checkpoint to checkpoint, over the maze' });
  if (id === BOSS) tags.push({ text: 'Damage Test', tone: 'boss', about: 'The damage it takes is the Run\'s score' });
  tags.push({ text: ARMOR_NAME[creep.armorType], tone: 'trait', about: `Armor type: ${ARMOR_NAME[creep.armorType]}` });
  return tags;
}

/** Wave `n`, as GEM_WAVES has it. */
function waveSpecOf(n: number): WaveSpec | undefined {
  return GEM_WAVES[n - 1];
}

/** The numbers a group's creeps spawn with at `difficulty`, as the sim starts the Wave. */
function numbersOf(w: WaveSpec, g: WaveGroup, difficulty: Difficulty): { hp: number; speed: number; bounty: number } {
  return waveGroupNumbers(gem.GEM_RULES, w, g, difficulty);
}

/** One creep group in full: its numbers at the Difficulty, its rules, and Best against. */
function creepSection(n: number, w: WaveSpec, g: WaveGroup, difficulty: Difficulty): ReferenceSection {
  const creep = GEM_CREEPS[g.creep]!;
  const nums = numbersOf(w, g, difficulty);
  const best = bestAgainst(creep);
  const lines: string[] = [];
  if (creep.flying) lines.push('Flies straight from checkpoint to checkpoint, over the maze');
  if (creep.hero) lines.push(`A hero: Frost slows it for ${secs(FROST.heroDuration)} instead of ${secs(FROST.duration)}`);
  if (g.creep === BOSS) lines.push(`Comes with Wave ${n}, ${secs(g.delay ?? 0)} after its first creep; the damage it takes is the Run's score`);
  return {
    title: `${num(g.count)} × ${creep.name}`,
    swatch: creepColor(g.creep),
    tags: creepTags(g.creep, creep),
    facts: [
      ['HP', num(nums.hp)],
      ['Armor', `${ARMOR_NAME[creep.armorType]} ${num(creep.armor)}`],
      ['Through armor', `${pct(armorMultiplier(creep.armor, ARMOR_FACTOR))}; spell damage skips it`],
      ['Speed', num(nums.speed)],
      ['Slowed to', `${num(creep.minSpeed)} at least`],
      ['Bounty', `${num(nums.bounty)} gold each`],
      ['Leak', gem.leakEndsRun(n) ? 'Ends the Run' : 'Free, but no bounty'],
    ],
    lines,
    ranks: [best.types, best.specials],
  };
}

function waveRow(n: number, difficulty: Difficulty): ReferenceRow | null {
  const w = waveSpecOf(n);
  const g = w?.groups[0];
  if (!w || !g) return null;
  const creep = GEM_CREEPS[g.creep]!;
  const nums = numbersOf(w, g, difficulty);
  const boss = w.groups.find((x) => x.creep === BOSS);
  const facts: [string, string][] = [
    ['Creeps', `${num(g.count)}, ${secs(g.interval)} apart`],
    ['Bounty pool', `${num(g.count * nums.bounty)} gold`],
    ['Wave bonus', `${num(gem.waveEndGold(n))} gold`],
  ];
  if (boss) facts.push(['Damage Test', `${secs(boss.delay ?? 0)} in`]);
  return {
    id: `wave-${n}`,
    lead: String(n),
    title: `${num(g.count)} ${creep.name}${boss ? ' + Damage Test' : ''}`,
    summary: `${num(nums.hp)} HP`,
    tags: creepTags(g.creep, creep),
    sections: [{ facts }, creepSection(n, w, g, difficulty)],
  };
}

/** The Damage Test, the boss that comes with the last Wave: its own row after it. */
function damageTestRow(difficulty: Difficulty): ReferenceRow | null {
  const w = waveSpecOf(WAVE_COUNT);
  const g = w?.groups.find((x) => x.creep === BOSS);
  if (!w || !g) return null;
  const creep = GEM_CREEPS[BOSS]!;
  return {
    id: 'damage-test',
    lead: String(WAVE_COUNT),
    title: creep.name,
    summary: `${num(numbersOf(w, g, difficulty).hp)} HP`,
    tags: creepTags(BOSS, creep),
    sections: [creepSection(WAVE_COUNT, w, g, difficulty)],
  };
}

/** Waves whose creeps fly. */
const AIR_WAVES = GEM_WAVES.flatMap((w, i) => (GEM_CREEPS[w.groups[0]!.creep]?.flying ? [i + 1] : []));

/** "every 4th Wave" when the air Waves are every k-th, else their list. */
function airText(): string {
  const k = AIR_WAVES[0] ?? 0;
  const regular = k > 0 && AIR_WAVES.every((n, i) => n === k * (i + 1)) && AIR_WAVES.length === Math.floor(WAVE_COUNT / k);
  return regular ? `Air every ${ordinal(k)} Wave` : `Air ${AIR_WAVES.join(', ')}`;
}

/** 1st, 2nd, 3rd, 4th. */
function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${num(n)}${suffix}`;
}

// --- Filters -----------------------------------------------------------------------

const isDifficulty = (v: string | undefined): v is Difficulty => (DIFFICULTIES as readonly string[]).includes(v ?? '');

/** The Difficulty these values show. */
export function difficultyOf(values: ReferenceValues): Difficulty {
  const d = values['difficulty'];
  return isDifficulty(d) ? d : 'normal';
}

function defaults(ctx: ReferenceContext): ReferenceValues {
  if (ctx.view) return { difficulty: ctx.view.state.difficulty };
  return { difficulty: ctx.from?.['difficulty'] ?? 'normal' };
}

function filters(values: ReferenceValues, ctx: ReferenceContext): ReferenceFilter[] {
  return [{
    id: 'difficulty', label: 'Difficulty', kind: 'seg', value: difficultyOf(values), tabs: ['waves'],
    choices: DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_NAME[d], about: difficultyAbout('gem', d) })),
    ...(ctx.view ? { locked: 'Fixed for this Run' } : {}),
  }];
}

function waves(values: ReferenceValues): ReferenceTab {
  const d = difficultyOf(values);
  const rows: ReferenceRow[] = [];
  for (let n = 1; n <= WAVE_COUNT; n++) {
    const row = waveRow(n, d);
    if (row) rows.push(row);
  }
  const test = damageTestRow(d);
  if (test) rows.push(test);
  const boss = GEM_CREEPS[BOSS]!;
  const last = waveSpecOf(WAVE_COUNT);
  const bossGroup = last?.groups.find((g) => g.creep === BOSS);
  const bossHp = last && bossGroup ? numbersOf(last, bossGroup, d).hp : boss.hp;
  return {
    intro: [
      { text: `${num(gem.START_GOLD)} gold` },
      { text: `Draft ${num(gem.DRAFT_SIZE)}, keep 1`, about: 'Keeping one starts the Wave; the rest turn into Rocks' },
      { text: `Leaks fatal from Wave ${firstFatalWave()}`, tone: 'bad', about: 'From then on one Leak ends the Run; before, a Leak costs only its bounty' },
      { text: airText(), tone: 'air', about: `Waves ${AIR_WAVES.join(', ')}` },
      {
        text: `Damage Test at Wave ${WAVE_COUNT}`, tone: 'boss',
        about: `${num(bossHp)} HP, ${ARMOR_NAME[boss.armorType]} ${num(boss.armor)}: the damage it takes is the score`,
      },
    ],
    groups: [{ id: 'waves', rows }],
  };
}

/** The first Wave on which a Leak ends the Run. */
function firstFatalWave(): number {
  for (let n = 1; n <= WAVE_COUNT; n++) if (gem.leakEndsRun(n)) return n;
  return WAVE_COUNT + 1;
}

// --- Towers ------------------------------------------------------------------------

const WAVE_CREEPS: readonly { readonly n: number; readonly id: string; readonly creep: GemCreepSpec }[] = GEM_WAVES.flatMap((w, i) =>
  w.groups.map((g) => ({ n: i + 1, id: g.creep, creep: GEM_CREEPS[g.creep]! })));

/** "Waves 5, 6, 11" with that armor that `layer` can reach; the Damage Test by name. */
function wavesWith(armor: string, layer: Layer): string {
  const hit = WAVE_CREEPS.filter((x) => x.creep.armorType === armor && reaches(layer, x.creep.flying));
  const ns = hit.filter((x) => x.id !== BOSS).map((x) => x.n);
  const parts = ns.length > 0 ? [`${ns.length === 1 ? 'Wave' : 'Waves'} ${ns.join(', ')}`] : [];
  if (hit.some((x) => x.id === BOSS)) parts.push('the Damage Test');
  return parts.join(' and ');
}

/** Strong against / Weak against for `type` over the armor types of the creeps `layer` can reach, with the layer it can't. */
export function strengths(type: string, layer: Layer): ReferenceSection[] {
  const armors = ARMOR_TYPES.filter((a) => WAVE_CREEPS.some((x) => x.creep.armorType === a && reaches(layer, x.creep.flying)));
  const prof = armorProfile(type, armors, share);
  const tag = (armor: string, s: number, tone: 'good' | 'bad'): ReferenceTag => ({
    text: `${ARMOR_NAME[armor as ArmorType]} ${pct(s)}`, tone, about: wavesWith(armor, layer),
  });
  const named = (rows: readonly { armor: string; share: number }[]): string[] =>
    rows.map((r) => `${ARMOR_NAME[r.armor as ArmorType]} ${pct(r.share)}: ${wavesWith(r.armor, layer)}`);
  const strong = prof.even && armors.length > 1
    ? [{ text: `Every armor ${pct(share(type, armors[0]!))}`, tone: 'good' as const }]
    : prof.strong.map((r) => tag(r.armor, r.share, 'good'));
  const weak = prof.weak.map((r) => tag(r.armor, r.share, 'bad'));
  const missing = layer === 'ground' ? 'Air' : layer === 'air' ? 'Ground' : null;
  if (missing) weak.push({ text: missing, tone: 'bad', about: layer === 'ground' ? `Can't hit the air Waves: ${AIR_WAVES.join(', ')}` : 'Can\'t hit any ground Wave' });
  return [
    { title: 'Strong against', tags: strong.length > 0 ? strong : [{ text: 'Nothing above 100%' }], ...(prof.even && armors.length > 1 ? {} : { lines: named(prof.strong) }) },
    {
      title: 'Weak against', tags: weak.length > 0 ? weak : [{ text: 'Nothing', tone: 'good' }],
      ...(prof.weak.length > 0 ? { lines: named(prof.weak) } : {}),
    },
  ];
}

/** "Kill Step 1 → 11: lightning 180 → 480": what grows with its kills, beside the kill award every attack gets. */
function killStepLines(s: GemTowerSpec): string[] {
  const out: string[] = [];
  const range = (t: readonly number[], f: (x: number) => string = num): string => `${f(t[0]!)} → ${f(t.at(-1)!)}`;
  const step = `Kill Step 1 → ${TOP_STEP}`;
  for (const e of s.attack?.effects ?? []) {
    if (e.kind === 'gem.lightning') out.push(`${step}: lightning ${range((e as GemLightningEffect).byKillStep)} a creep`);
    else if (e.kind === 'gem.killCrit') out.push(`${step}: crit ×${range((e as GemKillCritEffect).byKillStep)}`);
    else if (e.kind === 'gem.shadowStrike') {
      const sh = e as GemShadowStrikeEffect;
      out.push(`${step}: Shadow Strike ${range(sh.byKillStep)} a tick, for ${range(sh.durationByKillStep)} s`);
    } else if (e.kind === 'gem.spells') {
      for (const sp of (e as GemSpellsEffect).spells) {
        if ('damage' in sp && Array.isArray(sp.damage) && sp.damage.length > 1) out.push(`${step}: ${SPELL_NAME[sp.spell]} ${range(sp.damage)}`);
      }
    }
  }
  if (s.gem.killAura) out.push(`${step}: damage aura +${range(s.gem.killAura.byKillStep, pct)}`);
  if (s.gem.burn) out.push(`Its burn: +${pct(gem.burnBonus(10) - 1)} per 10 kills, up to +${pct(gem.burnBonus(Number.MAX_SAFE_INTEGER) - 1)}`);
  return out;
}

const SPELL_NAME: Readonly<Record<GemSpell['spell'], string>> = {
  fanOfKnives: 'Fan of Knives', forkedLightning: 'Forked Lightning', carrionSwarm: 'Carrion Swarm', thunderClap: 'Thunder Clap', armor: 'Armor break',
};

/** A slate spell at Kill Step 1. */
function spellText(sp: GemSpell): string {
  switch (sp.spell) {
    case 'fanOfKnives': return `Fan of Knives: ${num(sp.damage[0]!)} to all within ${num(sp.radius[0]!)}, ${num(sp.maxTotal)} at most`;
    case 'forkedLightning': return `Forked Lightning: ${num(sp.damage[0]!)} to up to ${num(sp.maxTargets)} creeps`;
    case 'carrionSwarm': return `Carrion Swarm: ${num(sp.damage)} along a line, ${num(sp.maxTotal)} at most`;
    case 'thunderClap': return `Thunder Clap: ${num(sp.damage[0]!)} within ${num(sp.radius[0]!)} and a ${pct(sp.slow)} slow`;
    case 'armor': return `Armor break: −${num(sp.amount)} armor for ${secs(sp.duration)}`;
  }
}

/** Damage, type, speed, range and what it hits; a slate's grab or strike by its own type, a burn by its own numbers. */
function attackFacts(s: GemTowerSpec): [string, string][] {
  const facts: [string, string][] = [];
  const a = s.attack;
  const type = hitTypeOf(s);
  const label = type ? ATTACK_NAME[type] ?? type : null;
  if (a && triggerOf(s)) {
    facts.push(['Type', label!], ['Range', num(a.range)]);
  } else if (a && a.damage[1] > 0) {
    facts.push(['Damage', damageText(s)!], ['Type', label!], ['Speed', rate(a.cooldown)], ['Range', num(a.range)]);
  } else if (label) {
    facts.push(['Type', label]);
  }
  if (s.gem.burn) facts.push(['Burn', `${num(s.gem.burn.dps)}/s within ${num(s.gem.burn.radius)}`]);
  const layer = layerOf(s);
  if (layer) facts.push(['Hits', hitsText(layer)]);
  return facts;
}

/** Abilities, slate spells, dice and Kill Step lines. */
function abilityLines(s: GemTowerSpec): string[] {
  const lines = abilities(s).map((a) => a.text);
  for (const e of s.attack?.effects ?? []) if (e.kind === 'gem.spells') for (const sp of (e as GemSpellsEffect).spells) lines.push(spellText(sp));
  const dice = s.attack?.dice;
  if (dice && dice[0] > 1) lines.push(`Rolls ${num(dice[0])} dice, so most hits land near the middle`);
  const sd = spellDamageOf(s);
  if (sd) lines.push(`Its ${sd} is spell damage: the ${ATTACK_NAME[SPELL_ATTACK_TYPE]} row, and it skips armor`);
  return [...lines, ...killStepLines(s)];
}

/** Strong and Weak against for a structure that deals damage; none for one that only supports. */
function strengthsOf(s: GemTowerSpec): ReferenceSection[] {
  const type = hitTypeOf(s);
  const layer = layerOf(s);
  return type && layer ? strengths(type, layer) : [];
}

const LAYER_TAG: Partial<Record<Layer, ReferenceTag>> = {
  ground: { text: 'Ground only', tone: 'bad', about: 'Can\'t hit flying creeps' },
  air: { text: 'Air only', tone: 'bad', about: 'Can\'t hit ground creeps' },
};

function layerTags(s: GemTowerSpec): ReferenceTag[] {
  const layer = layerOf(s);
  const tag = layer ? LAYER_TAG[layer] : undefined;
  return tag ? [tag] : [];
}

/** "60–80 · 1/s · 1,350": a structure's line in the list. */
function summaryOf(s: GemTowerSpec): string {
  const a = s.attack;
  if (a && a.damage[1] > 0 && !triggerOf(s)) return [damageText(s)!, rate(a.cooldown), num(a.range)].join(' · ');
  if (s.gem.burn) return `Burn ${num(s.gem.burn.dps)}/s · ${num(s.gem.burn.radius)}`;
  return abilities(s)[0]?.tag ?? '';
}

/** The first Gem Quality at which a Draft rolls `quality`, or null when none does. */
function rollsFrom(quality: Quality): number | null {
  const q = QUALITIES.indexOf(quality);
  const level = QUALITY_WEIGHTS.findIndex((w) => (w[q] ?? 0) > 0);
  return level < 0 ? null : level;
}

/** How many of a kind each merge needs, read from the sim's rule over a Draft's 1–5. */
function needsText(count: gem.MergeCount): string {
  const ns = Array.from({ length: gem.DRAFT_SIZE }, (_, i) => i + 1).filter((n) => gem.mergeAllowed(count, n));
  if (ns.length === 1) return `exactly ${num(ns[0]!)}`;
  return ns.at(-1) === gem.DRAFT_SIZE ? `${num(ns[0]!)} or more` : `${num(ns[0]!)}–${num(ns.at(-1)!)}`;
}

const RECIPE_OF: ReadonlyMap<string, SpecialLine> = new Map(SPECIAL_LINES.flatMap((l) => l.parts.map((p) => [p, l] as const)));

/** One basic gem: its attack, abilities, what merging makes, and the Recipe and slates it is part of. */
function gemRow(type: GemType, quality: Quality): ReferenceRow {
  const id = gemId(type, quality);
  const s = spec(id);
  const facts = attackFacts(s);
  const from = rollsFrom(quality);
  facts.push(['Rolls', from === null ? 'Never; only merging makes it' : from === 0 ? 'From the start' : `From Gem Quality ${from}`]);
  // Merging and downgrading happen in a Draft, which never holds a quality that doesn't roll.
  if (from !== null) {
    const two = gem.mergedSpec(id, 2);
    const three = gem.mergedSpec(id, 3);
    const four = gem.mergedSpec(id, 4);
    if (two) facts.push(['×2', specName(two)]);
    if (three && three === four) facts.push(['×3 or ×4', specName(three)]);
    else {
      if (three) facts.push(['×3', specName(three)]);
      if (four) facts.push(['×4', specName(four)]);
    }
    const down = gem.downgradedSpec(id);
    if (down) facts.push(['Downgrade', specName(down)]);
  }
  const recipe = RECIPE_OF.get(id);
  if (recipe) facts.push(['Recipe', recipe.name]);
  const slate = BASE_SLATES.find((x) => x.normal === id);
  if (slate) facts.push(['Slate', `${specName(slate.id)}, with ${either(slate.flawed.map(specName))}`]);
  const pieceOf = BASE_SLATES.filter((x) => x.flawed.includes(id));
  if (pieceOf.length > 0) facts.push(['Slate piece', either(pieceOf.map((x) => `${specName(x.id)} (with ${specName(x.normal)})`))]);
  return {
    id: `tower-${id}`,
    title: s.name,
    summary: summaryOf(s),
    swatch: TYPE_COLOR[type],
    tags: layerTags(s),
    sections: [{ facts, lines: abilityLines(s) }, ...strengthsOf(s)],
  };
}

/** A gem type's heading row: its attack type, what it hits, its ability, and how merging works. */
function gemHead(type: GemType): ReferenceRow {
  const s = spec(gemId(type, 'chipped'));
  const layer = layerOf(s)!;
  const kind = hitTypeOf(s)!;
  const ability = abilities(s)[0]?.tag;
  return {
    id: `gem-${type}`,
    title: typeName(type),
    summary: [ATTACK_NAME[kind] ?? kind, hitsText(layer), ...(ability ? [ability] : [])].join(' · '),
    swatch: TYPE_COLOR[type],
    tags: layerTags(s),
    sections: [
      {
        title: 'Gems',
        facts: [
          ['Type', ATTACK_NAME[kind] ?? kind], ['Hits', hitsText(layer)],
          ['Qualities', `${QUALITIES.length}: ${specName(gemId(type, QUALITIES[0]))} to ${specName(gemId(type, QUALITIES.at(-1)!))}`],
        ],
        lines: mergeLines(),
      },
      ...strengths(kind, layer),
    ],
  };
}

/** How merging works, from the sim's rule. */
function mergeLines(): string[] {
  const up = (count: gem.MergeCount): number => QUALITIES.indexOf(specOf(gem.mergedSpec(gemId(GEM_TYPES[0], QUALITIES[0]), count)!)!.gem.quality!);
  return [
    `Only identical gems of one Draft merge: ×2 (${needsText(2)} of a kind) goes ${plural(up(2), 'quality', 'qualities')} up; `
      + `×3 (${needsText(3)}) and ×4 (${needsText(4)}) go ${num(up(3))}`,
    `Above ${qualityName(QUALITIES.at(-1)!)} it becomes the ${specName(STONE_OF_BRYVX)}`,
  ];
}

/** The qualities a Draft can roll whose ×3 makes the Stone of Bryvx: Perfect. */
const STONE_FROM: readonly Quality[] = QUALITIES.filter((q) => rollsFrom(q) !== null && gem.mergedSpec(gemId(GEM_TYPES[0], q), 3) === STONE_OF_BRYVX);

/** A Recipe's heading row: its exact gems, its Tiers and their prices. */
function recipeHead(line: SpecialLine): ReferenceRow {
  const costs = line.tiers.slice(1).map((id) => spec(id).cost ?? 0);
  return {
    id: `recipe-${line.id}`,
    title: line.name,
    summary: plus(line.parts.map(specName)),
    swatch: GEM_LOOK.tower(line.tiers[0]!, spec(line.tiers[0]!)).color,
    sections: [{
      title: 'Recipe',
      facts: [
        ['Gems', plus(line.parts.map(specName))],
        ['Tiers', num(line.tiers.length)],
        ...(costs.length > 0 ? [['Upgrades', `${plus(costs.map((c) => `${num(c)} gold`))}`] as [string, string]] : []),
      ],
      lines: [
        'All of them in one Draft: Recipe makes it there and then',
        'Kept over several Drafts: once the last is kept, fuse them during a Wave; their kills add up',
        'An upgrade takes 1 s, during which it doesn\'t attack',
      ],
    }],
  };
}

function recipeRow(line: SpecialLine, i: number): ReferenceRow {
  const id = line.tiers[i]!;
  const s = spec(id);
  const facts = attackFacts(s);
  const total = line.tiers.slice(1, i + 1).reduce((sum, t) => sum + (spec(t).cost ?? 0), 0);
  const price: [string, string][] = i === 0
    ? [['From', 'the Recipe']]
    : [['Upgrade', `${num(gem.upgradeOf(line.tiers[i - 1]!)?.cost ?? 0)} gold`], ['Total', `${num(total)} gold`]];
  const next = gem.upgradeOf(id);
  if (next) price.push(['Upgrades to', `${specName(next.to)} · ${num(next.cost)} gold`]);
  return {
    id: `tower-${id}`,
    lead: `T${i + 1}`,
    title: s.name,
    summary: summaryOf(s),
    swatch: GEM_LOOK.tower(id, s).color,
    tags: layerTags(s),
    sections: [{ facts: [...price, ...facts], lines: abilityLines(s) }, ...strengthsOf(s)],
  };
}

function stoneRow(): ReferenceRow {
  const s = spec(STONE_OF_BRYVX);
  return {
    id: `tower-${STONE_OF_BRYVX}`,
    title: s.name,
    summary: summaryOf(s),
    swatch: GEM_LOOK.tower(STONE_OF_BRYVX, s).color,
    tags: layerTags(s),
    sections: [
      { facts: [['From', `×3 or ×4 identical ${either(STONE_FROM.map(qualityName))} gems in one Draft`], ...attackFacts(s)], lines: abilityLines(s) },
      ...strengthsOf(s),
    ],
  };
}

/** Every slate: the 8 base slates, then the 4 combinations. */
const SLATE_IDS: readonly string[] = [...BASE_SLATES.map((x) => x.id), ...Object.keys(COMBO_SLATES)];

function slateRow(id: string): ReferenceRow {
  const s = spec(id);
  const base = BASE_SLATES.find((x) => x.id === id);
  const combo = COMBO_SLATES[id];
  const made: [string, string][] = base
    ? [['From', `${specName(base.normal)} + ${either(base.flawed.map(specName))}`], ['Pair', `with ${specName(base.partner)}, makes ${specName(base.combo)}`]]
    : combo ? [['From', plus(combo.map(specName))]] : [];
  return {
    id: `tower-${id}`,
    lead: combo ? 'Pair' : 'Base',
    title: s.name,
    summary: summaryOf(s),
    swatch: GEM_LOOK.tower(id, s).color,
    tags: layerTags(s),
    sections: [{ facts: [...made, ...attackFacts(s)], lines: abilityLines(s) }, ...strengthsOf(s)],
  };
}

function slateHead(): ReferenceRow {
  return {
    id: 'slates',
    title: 'Slates',
    summary: `${num(BASE_SLATES.length)} base, ${num(Object.keys(COMBO_SLATES).length)} pairs`,
    sections: [{
      lines: [
        'Keep Slate: a Normal gem becomes its slate when the same Draft holds one of its Flawed gems',
        'Both slates: a Draft that makes both slates of a pair makes their combination',
        'Keeping a base slate while its partner stands on the field fuses during a Wave',
        'Creeps walk over a slate, and it leaves no Rock',
        `A slate can't stand within ${num(SLATE_STACKING_RADIUS)} of the same slate, its pair or its parts; it is pushed ${num(SLATE_PUSH)} away`,
        'Each slate can move once, during a Wave; slates can\'t be swapped',
      ],
    }],
  };
}

/** Gem Quality's odds at one level: each quality a Draft gem can roll, Chipped to Great. */
function oddsAt(level: number): [Quality, number][] {
  return gem.qualityOdds(level).map((p, i): [Quality, number] => [QUALITIES[i]!, p]).filter(([, p]) => p > 0);
}

function qualityRow(level: number): ReferenceRow {
  const odds = oddsAt(level);
  const total = QUALITY_COST.slice(0, level).reduce((a, b) => a + b, 0);
  return {
    id: `quality-${level}`,
    lead: String(level),
    title: odds.map(([q, p]) => `${qualityName(q)} ${pct(p)}`).join(' · '),
    summary: level === 0 ? 'At the start' : `${num(QUALITY_COST[level - 1]!)} gold`,
    sections: [{
      facts: [
        ...odds.map(([q, p]): [string, string] => [qualityName(q), pct(p)]),
        ...(level > 0 ? [['Research', `${num(QUALITY_COST[level - 1]!)} gold`] as [string, string], ['Total', `${num(total)} gold`] as [string, string]] : []),
      ],
      ...(level === EXTRA_CHANCE_QUALITY ? { lines: ['Opens Extra Chance'] } : {}),
    }],
  };
}

function extraChanceRow(): ReferenceRow {
  const q = EXTRA_CHANCE.typeQuality;
  return {
    id: 'extra-chance',
    lead: String(EXTRA_CHANCE_QUALITY),
    title: 'Extra Chance',
    summary: `${num(EXTRA_CHANCE.typeCost)} or ${num(EXTRA_CHANCE.slateCost)} gold`,
    sections: [{
      facts: [
        ['Opens', `at Gem Quality ${EXTRA_CHANCE_QUALITY}`],
        ['A gem type', `${num(EXTRA_CHANCE.typeCost)} gold a round`],
        ['A base slate', `${num(EXTRA_CHANCE.slateCost)} gold a round`],
        ['Rolls', `${num(EXTRA_CHANCE.rolls)}, one per Draft gem`],
        ...QUALITIES.slice(0, q.length).map((quality, i): [string, string] => [`A hit: ${qualityName(quality)}`, pct(q[i]!)]),
      ],
      lines: [
        'Set it before the round\'s first Draft gem; switching or clearing it refunds the gold',
        `Aiming at the same kind as last round adds 1 bonus, up to ${num(EXTRA_CHANCE.maxBonus)}; a round without it takes 1 off`,
        `At a bonus of ${num(EXTRA_CHANCE.thresholdBonus)} every roll hits; a hit spends 4 bonus`,
      ],
    }],
  };
}

function qualityHead(): ReferenceRow {
  const total = QUALITY_COST.reduce((a, b) => a + b, 0);
  return {
    id: 'quality',
    title: 'Gem Quality',
    summary: `0–${num(MAX_QUALITY)} · ${num(total)} gold in all`,
    sections: [{
      facts: [['Levels', `0 to ${num(MAX_QUALITY)}`], ['All of them', `${num(total)} gold`], ['Extra Chance', `at ${num(EXTRA_CHANCE_QUALITY)}`]],
      lines: [
        'Each Draft gem rolls its type at random, every type alike, and its quality by these odds',
        `${qualityName(QUALITIES.at(-1)!)} never rolls; only merging makes one`,
      ],
    }],
  };
}

function towers(): ReferenceTab {
  const groups: ReferenceGroup[] = [
    ...GEM_TYPES.map((type): ReferenceGroup => ({ id: `gem-${type}`, head: gemHead(type), rows: QUALITIES.map((q) => gemRow(type, q)) })),
    ...SPECIAL_LINES.map((line): ReferenceGroup => ({ id: `recipe-${line.id}`, head: recipeHead(line), rows: line.tiers.map((_, i) => recipeRow(line, i)) })),
    { id: 'stone', rows: [stoneRow()] },
    { id: 'slates', head: slateHead(), rows: SLATE_IDS.map(slateRow) },
    { id: 'quality', head: qualityHead(), rows: [...Array.from({ length: MAX_QUALITY + 1 }, (_, l) => qualityRow(l)), extraChanceRow()] },
  ];
  const award = gem.killAward(10);
  const awardTop = gem.killAward(Number.MAX_SAFE_INTEGER);
  return {
    intro: [
      { text: `Draft ${num(gem.DRAFT_SIZE)}, keep 1` },
      { text: 'Merge in one Draft', about: mergeLines().join('. ') },
      { text: `${num(SPECIAL_LINES.length)} Recipes`, about: 'Specials from exact gems; gold buys their Tiers' },
      { text: `+${pct(award)} per 10 kills`, tone: 'good', about: `Every structure that attacks gains +${pct(award)} attack damage per 10 kills, up to +${pct(awardTop)}` },
      { text: `Kill Step 1–${num(TOP_STEP)}`, about: 'A structure\'s kills in tens; some Specials and slates grow with it' },
    ],
    groups,
  };
}

// --- The sheet ---------------------------------------------------------------------

export const GEM_REFERENCE: ModeReference = {
  defaults,
  filters,
  waves,
  towers,
  current(view) {
    const st = gem.gemStatus(view.state);
    if (st.step === 'over') return { now: null, next: null };
    // In a build phase Now is the Wave the Draft leads to.
    const n = st.step === 'wave' ? Math.max(1, st.wave) : st.nextWave;
    return { now: `wave-${n}`, next: n < WAVE_COUNT ? `wave-${n + 1}` : n === WAVE_COUNT ? 'damage-test' : null };
  },
};


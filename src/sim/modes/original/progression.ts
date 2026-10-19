import {
  CAMPAIGN_LENGTH, CHALLENGES, ROW_COST, STAR_LIVES, TALENTS, TALENT_ROWS, UNLOCKS,
  type Family, type TalentSpec,
} from '../../../content/original';
import { DIFFICULTIES, type Difficulty } from '../../core/state';

// The Campaign's progression as pure logic (docs/original-design.md §8–9,
// §16): unlocks, Stars, Talent purchases, Stage Records and Challenge
// Records. Nothing here touches a Run's state; the Stage-select screen and
// storage call these, and a Run only receives the result as Run settings
// (Talents, Stages finished and the Challenge played).

/** What the Campaign has opened. */
export interface Unlocks {
  /** Tower Families that can be built, in unlock order. */
  readonly families: readonly Family[];
  /** The highest Tier a tower may climb to: 2 at first, 3 after Stage 2. */
  readonly maxTier: 2 | 3;
  readonly specialisations: boolean;
  /** Whether Talents can be bought (each family's tree opens with the family). */
  readonly talents: boolean;
}

/** The unlocks after finishing Stages 1…`cleared` (0 at the start of the Campaign). */
export function unlocksFor(cleared: number): Unlocks {
  const families: Family[] = [];
  let maxTier: 2 | 3 = 2;
  let specialisations = false;
  let talents = false;
  for (const step of UNLOCKS) {
    if (step.after > cleared) continue;
    for (const f of step.families ?? []) if (!families.includes(f)) families.push(f);
    if (step.tier3) maxTier = 3;
    if (step.specialisations) specialisations = true;
    if (step.talents) talents = true;
  }
  return { families, maxTier, specialisations, talents };
}

/** Stars for a won Stage with `lives` left: 3 for 18 or more, 2 for 6 or more, 1 otherwise. */
export function starsFor(lives: number): number {
  for (const row of STAR_LIVES) if (lives >= row.lives) return row.stars;
  return 0;
}

/** Stars a win adds to the Campaign: replaying pays only the difference over the Stage's best. */
export function starsGained(best: number, stars: number): number {
  return Math.max(0, stars - best);
}

/** Most Stars the Stages pay: 3 each, 36 in all. */
export function maxStageStars(): number {
  return CAMPAIGN_LENGTH * (STAR_LIVES[0]?.stars ?? 3);
}

/** Most Stars the Challenges pay: each one's Stars, once, 12 in all. */
export function maxChallengeStars(): number {
  let total = 0;
  for (const c of CHALLENGES) total += c.stars;
  return total;
}

/** Most Stars the Campaign holds: the Stages' and the Challenges', 48, which fill all six Talent trees. */
export function maxStars(): number {
  return maxStageStars() + maxChallengeStars();
}

export function talentCost(row: number): number {
  return ROW_COST[row - 1] ?? 0;
}

/** Stars a set of Talents cost in all. */
export function starsSpent(talents: readonly string[]): number {
  let total = 0;
  for (const id of talents) if (Object.hasOwn(TALENTS, id)) total += talentCost(TALENTS[id]!.row);
  return total;
}

/** A Talent by id, or undefined. */
export function talentById(id: string): TalentSpec | undefined {
  return Object.hasOwn(TALENTS, id) ? TALENTS[id] : undefined;
}

/**
 * A problem with a set of Talents, or null when it is one a player could
 * hold: known ids, no repeats, one per row, and each family's rows in order.
 */
export function talentsProblem(talents: readonly unknown[]): string | null {
  const held = new Map<Family, Set<number>>();
  const seen = new Set<string>();
  for (const id of talents) {
    if (typeof id !== 'string' || !Object.hasOwn(TALENTS, id)) return `no Talent ${String(id)}`;
    if (seen.has(id)) return `${id} is held twice`;
    seen.add(id);
    const t = TALENTS[id]!;
    const rows = held.get(t.family) ?? new Set<number>();
    if (rows.has(t.row)) return `two Talents from row ${t.row} of the ${t.family} tree`;
    rows.add(t.row);
    held.set(t.family, rows);
  }
  for (const [family, rows] of held) {
    for (let row = 1; row <= TALENT_ROWS; row++) {
      if (rows.has(row + 1) && !rows.has(row)) return `the ${family} tree's row ${row + 1} needs row ${row} first`;
    }
  }
  return null;
}

/** Why `id` can't be bought now with `stars` earned in all, or null. Buying fills the family's next row. */
export function talentError(held: readonly string[], id: string, stars: number, unlocks: Unlocks): string | null {
  const t = talentById(id);
  if (!t) return 'no such Talent';
  if (!unlocks.talents) return 'Talents open after Stage 1';
  if (!unlocks.families.includes(t.family)) return `the ${t.family} tree isn't open yet`;
  if (held.includes(id)) return 'already held';
  const rows = held.map(talentById).filter((h): h is TalentSpec => h?.family === t.family).map((h) => h.row);
  if (rows.includes(t.row)) return 'one Talent per row';
  if (t.row > 1 && !rows.includes(t.row - 1)) return `needs row ${t.row - 1} first`;
  const free = stars - starsSpent(held);
  if (talentCost(t.row) > free) return `needs ${talentCost(t.row)} Stars`;
  return null;
}

/** The Talents after buying `id`; throws when talentError refuses it. */
export function buyTalent(held: readonly string[], id: string, stars: number, unlocks: Unlocks): string[] {
  const refused = talentError(held, id, stars, unlocks);
  if (refused) throw new Error(refused);
  return [...held, id];
}

/** A free reset: every Star back. */
export function resetTalents(): string[] {
  return [];
}

/** The Talents a family's tree offers, row by row. */
export function treeRows(family: Family): TalentSpec[][] {
  const rows: TalentSpec[][] = [];
  for (const t of Object.values(TALENTS)) if (t.family === family) (rows[t.row - 1] ??= []).push(t);
  return rows;
}

// --- Stage Records ------------------------------------------------------------------

/** What one Run of a Stage achieved. */
export interface StageResult {
  readonly won: boolean;
  readonly stars: number;
  readonly difficulty: Difficulty;
  /** Seconds from Wave 1 to the win; null when lost. */
  readonly seconds: number | null;
}

/** A Stage's Record: its best Stars, the hardest Difficulty won and the fastest win. */
export interface StageRecord {
  readonly stars: number;
  readonly hardest: Difficulty | null;
  readonly fastest: number | null;
}

/**
 * A Challenge's Record, kept once it is won: its fastest win. Its Stars are
 * paid with the first win and never again, so the Record itself is the proof.
 */
export interface ChallengeRecord {
  readonly fastest: number | null;
}

/** The Challenge Record after a Run of it; a loss changes nothing, and a first win creates it. */
export function mergeChallengeRecord(record: ChallengeRecord | null, result: StageResult): ChallengeRecord | null {
  if (!result.won) return record;
  const old = record?.fastest ?? null;
  const faster = result.seconds !== null && (old === null || result.seconds < old);
  return { fastest: faster ? result.seconds : old };
}

/** Stars a Challenge Run adds to the Campaign: the Challenge's on its first win, nothing after. */
export function challengeStarsGained(record: ChallengeRecord | null, result: StageResult, stars: number): number {
  return result.won && record === null ? stars : 0;
}

/** The Record after a Run; a loss changes nothing. */
export function mergeStageRecord(record: StageRecord | null, result: StageResult): StageRecord {
  const old: StageRecord = record ?? { stars: 0, hardest: null, fastest: null };
  if (!result.won) return old;
  const harder = old.hardest === null || DIFFICULTIES.indexOf(result.difficulty) > DIFFICULTIES.indexOf(old.hardest);
  const faster = result.seconds !== null && (old.fastest === null || result.seconds < old.fastest);
  return {
    stars: Math.max(old.stars, result.stars),
    hardest: harder ? result.difficulty : old.hardest,
    fastest: faster ? result.seconds : old.fastest,
  };
}

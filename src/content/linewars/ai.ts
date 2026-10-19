import type { AiProfile, AiWeights, SkillId } from './types';

// The Rival's AI as data (docs/line-wars-design.md §11–12): its maze, how it
// weighs what towers do, and a skill profile per Difficulty. The rules that
// read these live in src/sim/modes/linewars/ai. Every number is [tune].

/**
 * The blueprint: a serpentine of 9 rows of 7 Walls in a 16-wide Field, each
 * row with a 2-wide gap at alternate ends, 63 Walls and 630 gold in all. Rows
 * are in the Field's local terms (local row 0 is the first open row, Map row
 * 2; local column 0 its outer edge), top to bottom.
 */
export const BLUEPRINT_ROWS: readonly number[] = [1, 4, 7, 10, 13, 16, 19, 22, 25];

/** Rows are built from the Field's middle outward, as indices into BLUEPRINT_ROWS. */
export const BLUEPRINT_ORDER: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/** Walls in a blueprint row. */
export const ROW_WALLS = 7;

/**
 * The blueprint's Walls in build order, as [local column, local row] of each
 * 2 × 2 Wall's first column: every row from its closed end toward its gap.
 * Row 0's gap is at local columns 14–15 unless the AI flips the maze (one of
 * its seeded variations), and each next row's at the other end.
 */
export function blueprint(flip: boolean): [col: number, row: number][] {
  const out: [number, number][] = [];
  for (const index of BLUEPRINT_ORDER) {
    const gapInner = (index % 2 === 0) !== flip;
    const row = BLUEPRINT_ROWS[index]!;
    for (let k = 0; k < ROW_WALLS; k++) out.push([gapInner ? 2 * k : 14 - 2 * k, row]);
  }
  return out;
}

/** The opening Tier 1 is line A's, except the Runecasters', whose Glyph splash meets the first Snowlings. */
export const OPENING_LINE: Readonly<Record<string, 'a' | 'b'>> = { ironclad: 'a', rimeborn: 'a', mirefolk: 'a', runecasters: 'b' };

/** Until this Run second the AI only builds its opening (§11.4 rule 1). */
export const OPENING_UNTIL = 20;

/** Danger and the floor hold the gold only for an upgrade at most this many income ticks of pay away. */
export const HOLD_TICKS = 1;
/** Danger: one of your creeps in its Field whose margin is under this (rule 2). */
export const DANGER_MARGIN = 1;
/** Seconds after one of yours leaks that Normal and up stay in Danger. */
export const DANGER_AFTER_LEAK = 20;
/** The crowd factor: 1 + this for every other creep of the same sender in that Field, at most CROWD_MAX. */
export const CROWD_STEP = 0.1;
export const CROWD_MAX = 2;

/** Air guard (rule 4): towers that hit air covering the air line's last third, from each Run second on. */
export const AIR_GUARD: readonly (readonly [from: number, towers: number])[] = [[270, 2], [480, 3], [660, 4]];
/** The share of the air line, from its end, that the air guard covers. */
export const AIR_GUARD_SPAN = 1 / 3;
/** Once Harpies are unlocked, an air-hitting upgrade's air cells count at least this air share. */
export const MIN_AIR_SHARE = 0.15;

/** Defense floor (rule 5): towers worth at least this share of all gold earned, and this plus λ × recent HP. */
export const FLOOR_SHARE = 0.4;
export const FLOOR_BASE = 150;
/** ...but the λ part never asks for more than this share of all gold earned, so a Side being sent at can still send back. */
export const FLOOR_CAP = 0.5;
/** Seconds of your Sends the floor counts. */
export const FLOOR_SECONDS = 60;

/** Greed (rule 6): a Send that would leak counts its income ratio this much more. */
export const GREED_LEAK_BONUS = 3;
/** A salvo must bring this many times the HP your maze can deal its creeps, crowd included. */
export const SALVO_MARGIN = 1;
/** When you are down to this many lives, Hard and Insane drop the reserve and the salvo margin falls to this. */
export const FINISH_LIVES = 5;
export const FINISH_MARGIN = 0.8;
/**
 * From its salvo time, this share of every gold it earns goes into a salvo
 * bank that only the salvo may spend, so saving never stalls the rest of its
 * play; the bank holds at most this many income ticks of pay.
 */
export const SALVO_SHARE = 0.4;
export const SALVO_BANK_TICKS = 20;
/** It plans salvos the bank will hold after this many income ticks of pay, or the bank itself if that is more. */
export const SALVO_PLAN_TICKS = 10;
/** A salvo whose creeps stole this many lives or more is bought again before a new one is planned. */
export const REPEAT_STEALS = 2;
/** Seconds of jitter either way on the salvo time. */
export const SALVO_JITTER = 30;
/** Harpies come first when your air defence would deal a pair less than this share of its HP. */
export const HARPY_THIN = 0.8;
/** Surplus (rule 7): gold above this many reserves goes to upgrades. */
export const SURPLUS_RESERVES = 2;

/** How the AI counts a tower's extras (§11.3). */
export const LW_AI_WEIGHTS: AiWeights = {
  splash: 1,
  multishot: 0.6,
  chain: 0.5,
  spread: 2,
  hitSlow: 0.6,
  slowValue: 30,
  armorValue: 3,
  venom: 1.5,
};

const HARD: AiProfile = {
  think: 0.5, actions: 3, rows: 9, skip: 0, mazeShare: 0.35, pick: 'best', bestChance: 1, lambda: 0.5, reserve: 1,
  airFrom: 270, salvoFrom: 360, sight: 'armor', harpies: false, leakDanger: true,
  leakLambda: 0.1, leakLambdaMax: 0.3, leakLambdaFade: 0.1,
};

/** The skill profiles (§12), and `competent`: Hard's rules thinking every second with 3 actions (§13). */
export const AI_PROFILES: Readonly<Record<SkillId, AiProfile>> = {
  easy: {
    think: 2, actions: 1, rows: 6, skip: 0.25, mazeShare: 0.25, pick: 'top3', bestChance: 0, lambda: 0.3, reserve: 0,
    airFrom: null, salvoFrom: null, sight: 'raw', harpies: false, leakDanger: false,
    leakLambda: 0, leakLambdaMax: 0, leakLambdaFade: 0,
  },
  // Normal, like Easy, saves for salvos only in Sudden Death.
  normal: {
    think: 1, actions: 2, rows: 9, skip: 0, mazeShare: 0.35, pick: 'mostly', bestChance: 0.75, lambda: 0.4, reserve: 0.5,
    airFrom: 270, salvoFrom: null, sight: 'raw', harpies: false, leakDanger: true,
    leakLambda: 0, leakLambdaMax: 0, leakLambdaFade: 0,
  },
  hard: HARD,
  insane: { ...HARD, actions: 4, lambda: 0.55, harpies: true },
  competent: { ...HARD, think: 1, actions: 3 },
};

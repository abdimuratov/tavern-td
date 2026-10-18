import type { Difficulty } from '../../sim';

// Line Wars' economy and pace (docs/line-wars-design.md §9–10). Numbers marked
// [tune] are the bots' knobs (§13).

/** Each Side's start: gold, income per income tick, and lives [tune]. */
export const START_GOLD = 150;
export const START_INCOME = 10;
export const START_LIVES = 30;

/** Seconds between income ticks; the first is at 0:10. */
export const INCOME_SECONDS = 10;

/** The Rival's pay is ⌊income × this⌋ each income tick; yours is never scaled. Bounty never is [tune]. */
export const RIVAL_INCOME: Readonly<Record<Difficulty, number>> = { easy: 0.85, normal: 1, hard: 1.1, insane: 1.5 };

/** At most this many of a Side's creeps alive in the other Field. A Snowling pack counts 3. */
export const LIVE_CAP = 40;

/** Until this Run second a sale returns everything; after it, Maul's 75%. */
export const FULL_SALE_UNTIL = 20;

/** Sudden Death starts at this Run second [tune]: income freezes and each income tick drains lives. */
export const SUDDEN_DEATH_AT = 15 * 60;
/** Lives each Side loses on every income tick in Sudden Death. */
export const DRAIN_LIVES = 1;
/** A Send bought in Sudden Death has its HP times 1 + this for each minute since it began [tune]. */
export const SUDDEN_HP_PER_MINUTE = 0.1;

/** Every this many income ticks, `lw.checkpoint` asks the app to autosave: once a minute. */
export const CHECKPOINT_EVERY = 6;

/** Seconds of Sends a Side remembers having entered its Field, for the AI's mix (§11.3). */
export const INBOUND_SECONDS = 120;

/** The score (§14): per life stolen, for a win, per second left before this Run second, and per life left. */
export const SCORE = { perSteal: 100, win: 1000, perSecond: 5, clock: 20 * 60, perLife: 20 } as const;

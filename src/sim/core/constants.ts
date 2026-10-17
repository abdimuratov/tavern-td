import type { Difficulty } from './state';

/** Simulation ticks per second (ADR-0002). Specs give seconds and per-second rates; the sim converts. */
export const TICK_RATE = 30;

/** One build cell in Warcraft III world units, so Classic ranges, speeds and radii port unchanged. */
export const CELL = 64;

/** Side of a Build Spot in cells: a tower on one covers BUILD_SPOT × BUILD_SPOT cells. */
export const BUILD_SPOT = 2;

/** WC3's "Combat – Armor Damage Reduction Multiplier". */
export const DEFAULT_ARMOR_FACTOR = 0.06;

/** Creep HP multiplier per Difficulty unless the Game Mode brings its own table. */
export const DEFAULT_DIFFICULTY_HP: Readonly<Record<Difficulty, number>> = {
  easy: 0.75,
  normal: 1,
  hard: 1.3,
  insane: 1.6,
};

/** An aura status outlives its refresh by a tick, so it still counts in the phases after the aura pass. */
export const AURA_TICKS = 2;

/** Slows never stop a creep outright; only a stun does. */
export const MIN_SPEED_FACTOR = 0.1;

/** Attack-speed bonuses are clamped like WC3's (−80% to +400%). */
export const MIN_ATTACK_RATE = 0.2;
export const MAX_ATTACK_RATE = 5;

/** Bumped when the GameState shape changes, so an old save is refused rather than misread. */
export const SNAPSHOT_VERSION = 1;

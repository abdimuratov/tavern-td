import {
  BOUNTY_POOL, INTEREST_RATE, MAUL_CREEPS, MAUL_WAVES, RAIDER_HP, WAVE_BONUS,
  type MaulWave,
} from '../../../content/maul';
import { powDet } from '../../core/math';
import type { WaveGroup, WaveSpec } from '../../core/specs';
import type { GameState } from '../../core/state';
import { spawnCount } from '../../path/grid';
import { mlState } from './state';

// The curves a Wave number drives (docs/maul-design.md §7), and Waves as the
// core's groups. Each Wave sends its creep from both spawns at once; a boss
// Wave sends a boss from each, with its escort close behind.

/** A Raider's HP on Wave w before Difficulty: 8 × 1.12^(w−1). */
export function raiderHp(wave: number): number {
  return RAIDER_HP.base * powDet(RAIDER_HP.growth, Math.max(0, wave - 1));
}

/** The gold Wave w's creeps carry between them: 10 × (1 + ⌊w/4⌋). */
export function bountyPool(wave: number): number {
  return BOUNTY_POOL.base * (1 + Math.floor(wave / BOUNTY_POOL.every));
}

/** The end-of-Wave bonus, paid when Wave w is cleared: 20 + 4w. */
export function waveBonus(wave: number): number {
  return WAVE_BONUS.base + WAVE_BONUS.perWave * wave;
}

/** Interest on `gold` unspent when Wave w is cleared: 4%, at most that Wave's bonus, in whole gold. */
export function interestOn(gold: number, wave: number): number {
  return Math.min(waveBonus(wave), Math.floor(Math.max(0, gold) * INTEREST_RATE));
}

/** Spawn indices a Wave row sends from: 0 is the west gate, 1 the east. */
export function spawnsOf(row: MaulWave): number[] {
  return row.spawns === 'west' ? [0] : row.spawns === 'east' ? [1] : [0, 1];
}

/** Seconds the east gate's creeps trail the west's, so the two streams don't march in lockstep. */
const EAST_OFFSET = 0.5;
/** Seconds after its boss that an escort starts out. */
const ESCORT_DELAY = 2;

/** The Waves this Run plays: its custom ones (tests and tools), or the 40 of docs/maul-design.md §6. */
export function runWaves(state: GameState): readonly MaulWave[] {
  return mlState(state).waves ?? MAUL_WAVES;
}

/**
 * Wave `index` (0-based) as core groups: HP from the curve (the core applies
 * Difficulty); bounty comes from the pool instead. On a Map with one spawn
 * (tests), both gates' creeps leave from it.
 */
export function waveSpec(state: GameState, index: number): WaveSpec | undefined {
  const row = runWaves(state)[index];
  if (!row) return undefined;
  const wave = index + 1;
  const unit = raiderHp(wave);
  const last = spawnCount(state.map) - 1;
  const groups: WaveGroup[] = [];
  for (const gate of spawnsOf(row)) {
    const spawn = Math.min(gate, last);
    const offset = gate === 1 ? EAST_OFFSET : 0;
    const cs = MAUL_CREEPS[row.creep]!;
    groups.push({
      creep: row.creep, count: cs.maul.perSpawn, interval: cs.maul.gap, delay: offset, hp: unit * cs.maul.hpMult, bounty: 0, spawn,
    });
    if (row.escort) {
      const es = MAUL_CREEPS[row.escort.creep]!;
      groups.push({
        creep: row.escort.creep, count: row.escort.count, interval: es.maul.gap, delay: offset + ESCORT_DELAY,
        hp: unit * es.maul.hpMult, bounty: 0, spawn,
      });
    }
  }
  return { groups };
}
